import { ApiError } from "../../utils/ApiError.js";
import User from "./user.model.js";

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
export const createUser = async (userData, actorId = null) => {
  const normalizedEmail = userData.email.toLowerCase();
  const normalizedMobile = normalizeMobile(userData.mobile);

  await Promise.all([
    ensureEmailIsUnique(normalizedEmail),
    ensureMobileIsUnique(normalizedMobile),
  ]);

  const user = await User.create({
    firstName: userData.firstName,
    middleName: userData.middleName ?? "",
    lastName: userData.lastName,
    displayName: userData.displayName ?? "",
    email: normalizedEmail,
    mobile: normalizedMobile,
    password: userData.password,
    profilePhoto: userData.profilePhoto ?? "",
    gender: userData.gender ?? "PREFER_NOT_TO_SAY",
    dateOfBirth: userData.dateOfBirth ?? null,
    status: userData.status ?? "ACTIVE",
    emailVerified: userData.emailVerified ?? false,
    mobileVerified: userData.mobileVerified ?? false,
    createdBy: actorId,
    updatedBy: actorId,
  });

  return User.findById(user._id).select("-password").lean();
};

/**
 * List users with pagination, filters, search and sorting.
 */
export const listUsers = async ({
  page = 1,
  limit = 10,
  search,
  status,
  gender,
  emailVerified,
  mobileVerified,
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  const filter = {
    isDeleted: false,
  };

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
export const getUserById = async (userId) => {
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
export const updateUser = async (userId, updateData, actorId = null) => {
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
  }

  if (updateData.mobile !== undefined) {
    const normalizedMobile = normalizeMobile(updateData.mobile);

    await ensureMobileIsUnique(normalizedMobile, userId);

    normalizedUpdateData.mobile = normalizedMobile;

    if (normalizedMobile !== user.mobile) {
      normalizedUpdateData.mobileVerified = false;
    }
  }

  if (
    updateData.email !== undefined &&
    updateData.email.toLowerCase() !== user.email
  ) {
    normalizedUpdateData.emailVerified = false;
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

  return updatedUser;
};

/**
 * Activate, deactivate or suspend a user.
 */
export const updateUserStatus = async (userId, status, actorId = null) => {
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
export const resetPassword = async (userId, newPassword, actorId = null) => {
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
export const softDeleteUser = async (userId, actorId = null) => {
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
