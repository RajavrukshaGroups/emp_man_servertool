import { ApiError } from "../../utils/ApiError.js";
import User from "./user.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";

const isPlatformScope = (context = {}) => context.roleScopeType === "ORG";

const ensureCompanyContext = (context = {}) => {
  console.log("ensureCompanyContext()");
  console.dir(context, { depth: null });

  if (isPlatformScope(context)) {
    return;
  }

  if (!context.companyId) {
    throw new ApiError(403, "Active company context is required.");
  }
};

const getCompanyUserIds = async (companyId) => {
  const accessRecords = await CompanyAccess.find({
    companyId,
    isDeleted: false,
    status: {
      $in: ["ONBOARDING", "ACTIVE", "INACTIVE"],
    },
  })
    .select("userId")
    .lean();

  return accessRecords.map((access) => access.userId);
};

const ensureUserBelongsToCompany = async (userId, context = {}) => {
  if (isPlatformScope(context)) {
    return;
  }

  ensureCompanyContext(context);

  const companyAccess = await CompanyAccess.findOne({
    userId,
    companyId: context.companyId,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!companyAccess) {
    /*
     * Return 404 rather than 403 so users cannot discover
     * records belonging to another company.
     */
    throw new ApiError(404, "User not found.");
  }
};

/**
 * Normalize an optional mobile number.
 */
const normalizeMobile = (mobile) => {
  if (mobile === undefined) {
    return undefined;
  }

  if (mobile === null || mobile.trim() === "") {
    return null;
  }

  return mobile.trim();
};

/**
 * Ensure email is unique among active/non-deleted users.
 */
const ensureEmailIsUnique = async (email, excludeUserId = null) => {
  const filter = {
    email: email.toLowerCase(),
    isDeleted: false,
  };

  if (excludeUserId) {
    filter._id = {
      $ne: excludeUserId,
    };
  }

  const existingUser = await User.findOne(filter).select("_id email").lean();

  if (existingUser) {
    throw new ApiError(409, "A user with this email address already exists.");
  }
};

/**
 * Ensure mobile is unique when provided.
 */
const ensureMobileIsUnique = async (mobile, excludeUserId = null) => {
  const normalizedMobile = normalizeMobile(mobile);

  if (!normalizedMobile) {
    return;
  }

  const filter = {
    mobile: normalizedMobile,
    isDeleted: false,
  };

  if (excludeUserId) {
    filter._id = {
      $ne: excludeUserId,
    };
  }

  const existingUser = await User.findOne(filter).select("_id mobile").lean();

  if (existingUser) {
    throw new ApiError(409, "A user with this mobile number already exists.");
  }
};

/**
 * Create a user.
 */
export const createUser = async (userData, context = {}) => {
  const { actorId = null, companyId = null } = context;

  const { forEmployeeOnboarding = false, ...userPayload } = userData;

  if (forEmployeeOnboarding && !companyId) {
    throw new ApiError(
      400,
      "Active company context is required for employee onboarding.",
    );
  }

  const normalizedEmail = userPayload.email.toLowerCase();

  const normalizedMobile = normalizeMobile(userPayload.mobile);

  await Promise.all([
    ensureEmailIsUnique(normalizedEmail),
    ensureMobileIsUnique(normalizedMobile),
  ]);

  const user = await User.create({
    firstName: userPayload.firstName,
    middleName: userPayload.middleName ?? "",
    lastName: userPayload.lastName,
    displayName: userPayload.displayName ?? "",

    email: normalizedEmail,
    mobile: normalizedMobile,

    password: userPayload.password,

    profilePhoto: userPayload.profilePhoto ?? "",

    gender: userPayload.gender ?? "PREFER_NOT_TO_SAY",

    dateOfBirth: userPayload.dateOfBirth ?? null,

    status: userPayload.status ?? "ACTIVE",

    emailVerified: userPayload.emailVerified ?? false,

    mobileVerified: userPayload.mobileVerified ?? false,

    onboardingStatus: "USER_CREATED",

    onboardingCompanyId: forEmployeeOnboarding ? companyId : null,

    onboardingCompletedAt: null,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return User.findById(user._id).select("-password").lean();
};

/**
 * List users with pagination, filters, search and sorting.
 */
export const listUsers = async (
  {
    page = 1,
    limit = 10,
    search,
    status,
    gender,
    emailVerified,
    mobileVerified,
    sortBy = "createdAt",
    sortOrder = "desc",
  },
  context = {},
) => {
  const filter = {
    isDeleted: false,
  };

  if (!isPlatformScope(context)) {
    ensureCompanyContext(context);

    const companyUserIds = await getCompanyUserIds(context.companyId);

    filter._id = {
      $in: companyUserIds,
    };
  }

  if (status) {
    filter.status = status;
  }

  if (gender) {
    filter.gender = gender;
  }

  if (typeof emailVerified === "boolean") {
    filter.emailVerified = emailVerified;
  }

  if (typeof mobileVerified === "boolean") {
    filter.mobileVerified = mobileVerified;
  }

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const searchExpression = new RegExp(escapedSearch, "i");

    filter.$or = [
      { firstName: searchExpression },
      { middleName: searchExpression },
      { lastName: searchExpression },
      { displayName: searchExpression },
      { email: searchExpression },
      { mobile: searchExpression },
    ];
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [users, totalRecords] = await Promise.all([
    User.find(filter)
      .select("-password")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    User.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    records: users,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

/**
 * Get one user by ID.
 */
export const getUserById = async (userId, context = {}) => {
  await ensureUserBelongsToCompany(userId, context);

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  })
    .select("-password")
    .lean();

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  return user;
};

/**
 * Update user profile and account details.
 */
/**
 * Update user profile and account details.
 */
export const updateUser = async (userId, updateData, context = {}) => {
  await ensureUserBelongsToCompany(userId, context);

  const actorId = context.actorId ?? null;

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const normalizedUpdateData = {
    ...updateData,
    updatedBy: actorId,
  };

  if (updateData.email !== undefined) {
    const normalizedEmail = updateData.email.toLowerCase();

    await ensureEmailIsUnique(normalizedEmail, userId);

    normalizedUpdateData.email = normalizedEmail;

    if (normalizedEmail !== user.email) {
      normalizedUpdateData.emailVerified = false;
    }
  }

  if (updateData.mobile !== undefined) {
    const normalizedMobile = normalizeMobile(updateData.mobile);

    await ensureMobileIsUnique(normalizedMobile, userId);

    normalizedUpdateData.mobile = normalizedMobile;

    if (normalizedMobile !== user.mobile) {
      normalizedUpdateData.mobileVerified = false;
    }
  }

  delete normalizedUpdateData.password;
  delete normalizedUpdateData.createdBy;
  delete normalizedUpdateData.deletedBy;
  delete normalizedUpdateData.deletedAt;
  delete normalizedUpdateData.isDeleted;
  delete normalizedUpdateData.lastLoginAt;
  delete normalizedUpdateData.passwordChangedAt;

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      isDeleted: false,
    },
    {
      $set: normalizedUpdateData,
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .select("-password")
    .lean();

  if (!updatedUser) {
    throw new ApiError(404, "User not found.");
  }

  return updatedUser;
};

/**
 * Activate, deactivate or suspend a user.
 */
export const updateUserStatus = async (userId, status, context = {}) => {
  await ensureUserBelongsToCompany(userId, context);

  const actorId = context.actorId ?? null;

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  user.status = status;
  user.updatedBy = actorId;

  await user.save();

  return User.findById(user._id).select("-password").lean();
};

/**
 * Change password using the current password.
 */
export const changePassword = async (
  userId,
  currentPassword,
  newPassword,
  actorId = null,
) => {
  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  }).select("+password");

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const isCurrentPasswordValid = await user.comparePassword(currentPassword);

  if (!isCurrentPasswordValid) {
    throw new ApiError(400, "Current password is incorrect.");
  }

  const isSamePassword = await user.comparePassword(newPassword);

  if (isSamePassword) {
    throw new ApiError(
      400,
      "New password must be different from the current password.",
    );
  }

  user.password = newPassword;
  user.updatedBy = actorId;

  await user.save();

  return true;
};

/**
 * Administrative password reset.
 *
 * This does not require the current password.
 */
export const resetPassword = async (userId, newPassword, context = {}) => {
  await ensureUserBelongsToCompany(userId, context);

  const actorId = context.actorId ?? null;

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  }).select("+password");

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const isSamePassword = await user.comparePassword(newPassword);

  if (isSamePassword) {
    throw new ApiError(
      400,
      "New password must be different from the current password.",
    );
  }

  user.password = newPassword;
  user.updatedBy = actorId;

  await user.save();

  return true;
};

/**
 * Soft-delete a user.
 */
export const softDeleteUser = async (userId, context = {}) => {
  await ensureUserBelongsToCompany(userId, context);

  const actorId = context.actorId ?? null;

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  user.isDeleted = true;
  user.status = "INACTIVE";
  user.deletedAt = new Date();
  user.deletedBy = actorId;
  user.updatedBy = actorId;

  await user.save();

  return true;
};
