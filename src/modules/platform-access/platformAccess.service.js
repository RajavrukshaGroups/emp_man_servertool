import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import PlatformAccess from "./platformAccess.model.js";
import Role from "../roles/role.model.js";
import User from "../users/user.model.js";

/**
 * Normalize optional mobile number.
 */
const normalizeMobile = (mobile) => {
  if (mobile === undefined || mobile === null) {
    return null;
  }

  const normalizedMobile = mobile.trim();

  return normalizedMobile || null;
};

/**
 * Normalize email.
 */
const normalizeEmail = (email) => {
  return email.trim().toLowerCase();
};

/**
 * Ensure the selected role exists and is a valid
 * active GLOBAL platform role.
 */
const getActiveGlobalRole = async (roleId, session = null) => {
  let query = Role.findOne({
    _id: roleId,
    scopeType: "GLOBAL",
    status: "ACTIVE",
    isDeleted: false,
  })
    .select(
      "_id name code description scopeType status permissionIds isSystemRole isEditable",
    )
    .lean();

  if (session) {
    query = query.session(session);
  }

  const role = await query;

  if (!role) {
    throw new ApiError(
      400,
      "Selected role is not a valid active platform role.",
    );
  }

  return role;
};

/**
 * Ensure the supplied email is globally unique.
 */
const ensureEmailIsUnique = async (
  email,
  excludeUserId = null,
  session = null,
) => {
  const filter = {
    email: normalizeEmail(email),
    isDeleted: false,
  };

  if (excludeUserId) {
    filter._id = {
      $ne: excludeUserId,
    };
  }

  let query = User.findOne(filter).select("_id email").lean();

  if (session) {
    query = query.session(session);
  }

  const existingUser = await query;

  if (existingUser) {
    throw new ApiError(409, "A user with this email address already exists.");
  }
};

/**
 * Ensure mobile number is globally unique when supplied.
 */
const ensureMobileIsUnique = async (
  mobile,
  excludeUserId = null,
  session = null,
) => {
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

  let query = User.findOne(filter).select("_id mobile").lean();

  if (session) {
    query = query.session(session);
  }

  const existingUser = await query;

  if (existingUser) {
    throw new ApiError(409, "A user with this mobile number already exists.");
  }
};

/**
 * Retrieve a populated PlatformAccess record.
 */
const getPopulatedPlatformAccess = async (platformAccessId) => {
  const platformAccess = await PlatformAccess.findOne({
    _id: platformAccessId,
    isDeleted: false,
  })
    .populate({
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto gender dateOfBirth status emailVerified mobileVerified lastLoginAt createdAt updatedAt",
    })
    .populate({
      path: "roleId",
      select:
        "name code description scopeType status isSystemRole isEditable permissionIds",
      populate: {
        path: "permissionIds",
        select: "code name module action description status",
      },
    })
    .populate({
      path: "createdBy",
      select: "firstName lastName displayName email",
    })
    .populate({
      path: "updatedBy",
      select: "firstName lastName displayName email",
    })
    .lean();

  if (!platformAccess) {
    throw new ApiError(404, "Platform administrator not found.");
  }

  return platformAccess;
};

/**
 * Create a new Platform Administrator.
 *
 * Transaction:
 *
 * 1. Create global User account.
 * 2. Create PlatformAccess.
 * 3. Assign an active GLOBAL role.
 */
export const createPlatformAdmin = async (adminData, actorId = null) => {
  const normalizedEmail = normalizeEmail(adminData.email);

  const normalizedMobile = normalizeMobile(adminData.mobile);

  /**
   * Read-only validation before transaction.
   */
  await Promise.all([
    getActiveGlobalRole(adminData.roleId),

    ensureEmailIsUnique(normalizedEmail),

    ensureMobileIsUnique(normalizedMobile),
  ]);

  const session = await mongoose.startSession();

  try {
    let createdPlatformAccessId = null;

    await session.withTransaction(async () => {
      /**
       * Revalidate the role within transaction.
       */
      const role = await getActiveGlobalRole(adminData.roleId, session);

      /**
       * Recheck uniqueness inside transaction.
       */
      await ensureEmailIsUnique(normalizedEmail, null, session);

      await ensureMobileIsUnique(normalizedMobile, null, session);

      /**
       * User model should hash password using its
       * existing pre-save middleware.
       */
      const [createdUser] = await User.create(
        [
          {
            firstName: adminData.firstName,

            middleName: adminData.middleName ?? "",

            lastName: adminData.lastName,

            displayName: adminData.displayName ?? "",

            email: normalizedEmail,

            mobile: normalizedMobile,

            password: adminData.password,

            status: "ACTIVE",

            emailVerified: adminData.emailVerified ?? false,

            mobileVerified: adminData.mobileVerified ?? false,

            createdBy: actorId,

            updatedBy: actorId,
          },
        ],
        {
          session,
        },
      );

      /**
       * Defensive check:
       * a GLOBAL role must never be attached through
       * CompanyAccess.
       */
      if (role.scopeType !== "GLOBAL") {
        throw new ApiError(
          400,
          "Platform administrators require a GLOBAL role.",
        );
      }

      const [createdPlatformAccess] = await PlatformAccess.create(
        [
          {
            userId: createdUser._id,

            roleId: role._id,

            status: adminData.status ?? "ACTIVE",

            createdBy: actorId,

            updatedBy: actorId,
          },
        ],
        {
          session,
        },
      );

      createdPlatformAccessId = createdPlatformAccess._id;
    });

    return getPopulatedPlatformAccess(createdPlatformAccessId);
  } catch (error) {
    /**
     * Handle MongoDB uniqueness violations.
     */
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern ?? {})[0];

      if (duplicateField === "email") {
        throw new ApiError(
          409,
          "A user with this email address already exists.",
        );
      }

      if (duplicateField === "mobile") {
        throw new ApiError(
          409,
          "A user with this mobile number already exists.",
        );
      }

      if (duplicateField === "userId") {
        throw new ApiError(409, "This user already has platform access.");
      }

      throw new ApiError(
        409,
        "A conflicting platform administrator record already exists.",
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * List Platform Administrators.
 */
export const listPlatformAdmins = async ({
  page = 1,
  limit = 10,
  search,
  status,
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  const matchStage = {
    isDeleted: false,
  };

  if (status) {
    matchStage.status = status;
  }

  /**
   * We need aggregation here because search may involve
   * fields stored inside the related User document.
   */
  const pipeline = [
    {
      $match: matchStage,
    },

    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },

    {
      $unwind: "$user",
    },

    {
      $lookup: {
        from: "roles",
        localField: "roleId",
        foreignField: "_id",
        as: "role",
      },
    },

    {
      $unwind: "$role",
    },

    /**
     * Platform access must always point to a GLOBAL role.
     */
    {
      $match: {
        "role.scopeType": "GLOBAL",
        "role.isDeleted": false,
      },
    },
  ];

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const searchExpression = new RegExp(escapedSearch, "i");

    pipeline.push({
      $match: {
        $or: [
          {
            "user.firstName": searchExpression,
          },
          {
            "user.lastName": searchExpression,
          },
          {
            "user.displayName": searchExpression,
          },
          {
            "user.email": searchExpression,
          },
          {
            "user.mobile": searchExpression,
          },
          {
            "role.name": searchExpression,
          },
          {
            "role.code": searchExpression,
          },
        ],
      },
    });
  }

  const skip = (page - 1) * limit;

  const sortDirection = sortOrder === "asc" ? 1 : -1;

  pipeline.push({
    $facet: {
      records: [
        {
          $sort: {
            [sortBy]: sortDirection,
          },
        },

        {
          $skip: skip,
        },

        {
          $limit: limit,
        },

        {
          $project: {
            _id: 1,

            status: 1,

            createdAt: 1,

            updatedAt: 1,

            createdBy: 1,

            updatedBy: 1,

            user: {
              _id: "$user._id",

              firstName: "$user.firstName",

              middleName: "$user.middleName",

              lastName: "$user.lastName",

              displayName: "$user.displayName",

              email: "$user.email",

              mobile: "$user.mobile",

              profilePhoto: "$user.profilePhoto",

              status: "$user.status",

              emailVerified: "$user.emailVerified",

              mobileVerified: "$user.mobileVerified",

              lastLoginAt: "$user.lastLoginAt",
            },

            role: {
              _id: "$role._id",

              name: "$role.name",

              code: "$role.code",

              description: "$role.description",

              scopeType: "$role.scopeType",

              status: "$role.status",
            },
          },
        },
      ],

      metadata: [
        {
          $count: "totalRecords",
        },
      ],
    },
  });

  const [result] = await PlatformAccess.aggregate(pipeline);

  const records = result?.records ?? [];

  const totalRecords = result?.metadata?.[0]?.totalRecords ?? 0;

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    records,

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
 * Get one Platform Administrator.
 */
export const getPlatformAdminById = async (platformAccessId) => {
  return getPopulatedPlatformAccess(platformAccessId);
};

/**
 * Update Platform Administrator.
 *
 * Updates both:
 *
 * User
 * PlatformAccess role
 */
export const updatePlatformAdmin = async (
  platformAccessId,
  updateData,
  actorId = null,
) => {
  const platformAccess = await PlatformAccess.findOne({
    _id: platformAccessId,
    isDeleted: false,
  });

  if (!platformAccess) {
    throw new ApiError(404, "Platform administrator not found.");
  }

  const user = await User.findOne({
    _id: platformAccess.userId,
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(404, "Platform administrator user account not found.");
  }

  /**
   * Validate new GLOBAL role.
   */
  if (updateData.roleId) {
    await getActiveGlobalRole(updateData.roleId);
  }

  /**
   * Validate unique email.
   */
  if (updateData.email) {
    const normalizedEmail = normalizeEmail(updateData.email);

    if (normalizedEmail !== user.email) {
      await ensureEmailIsUnique(normalizedEmail, user._id);
    }

    user.email = normalizedEmail;
  }

  /**
   * Validate unique mobile.
   */
  if (updateData.mobile !== undefined) {
    const normalizedMobile = normalizeMobile(updateData.mobile);

    if (normalizedMobile !== normalizeMobile(user.mobile)) {
      await ensureMobileIsUnique(normalizedMobile, user._id);
    }

    user.mobile = normalizedMobile;
  }

  if (updateData.firstName !== undefined) {
    user.firstName = updateData.firstName;
  }

  if (updateData.middleName !== undefined) {
    user.middleName = updateData.middleName;
  }

  if (updateData.lastName !== undefined) {
    user.lastName = updateData.lastName;
  }

  if (updateData.displayName !== undefined) {
    user.displayName = updateData.displayName;
  }

  if (updateData.emailVerified !== undefined) {
    user.emailVerified = updateData.emailVerified;
  }

  if (updateData.mobileVerified !== undefined) {
    user.mobileVerified = updateData.mobileVerified;
  }

  user.updatedBy = actorId;

  await user.save();

  if (updateData.roleId) {
    platformAccess.roleId = updateData.roleId;
  }

  platformAccess.updatedBy = actorId;

  await platformAccess.save();

  return getPopulatedPlatformAccess(platformAccessId);
};

/**
 * Update Platform Administrator access status.
 *
 * ACTIVE
 * INACTIVE
 * SUSPENDED
 *
 * Safety rules:
 * 1. A Platform Administrator cannot deactivate or suspend themselves.
 * 2. The last ACTIVE SUPER_ADMIN cannot be deactivated or suspended.
 */
export const updatePlatformAdminStatus = async (
  platformAccessId,
  status,
  actorId = null,
) => {
  const platformAccess = await PlatformAccess.findOne({
    _id: platformAccessId,
    isDeleted: false,
  }).populate({
    path: "roleId",
    select: "_id code scopeType status",
  });

  if (!platformAccess) {
    throw new ApiError(404, "Platform administrator not found.");
  }

  /**
   * Defensive validation.
   *
   * PlatformAccess should always point to a GLOBAL role.
   */
  if (!platformAccess.roleId || platformAccess.roleId.scopeType !== "GLOBAL") {
    throw new ApiError(
      400,
      "Selected account does not have valid GLOBAL platform access.",
    );
  }

  /**
   * Nothing needs to change.
   */
  if (platformAccess.status === status) {
    return getPopulatedPlatformAccess(platformAccessId);
  }

  /**
   * These are the statuses that remove operational access.
   */
  const isDisablingAccess = status === "INACTIVE" || status === "SUSPENDED";

  if (isDisablingAccess) {
    /**
     * Protection 1:
     *
     * actorId is the currently logged-in User ID.
     * platformAccess.userId is the User whose platform
     * access is being modified.
     */
    if (actorId && platformAccess.userId.toString() === actorId.toString()) {
      throw new ApiError(
        403,
        "You cannot deactivate or suspend your own platform access.",
      );
    }

    /**
     * Protection 2:
     *
     * If the target account is SUPER_ADMIN,
     * make sure another ACTIVE SUPER_ADMIN exists.
     */
    if (platformAccess.roleId.code === "SUPER_ADMIN") {
      /**
       * First obtain the SUPER_ADMIN GLOBAL role IDs.
       *
       * Doing this by role code keeps the check safe even
       * if platform roles are recreated in another database.
       */
      const superAdminRoles = await Role.find({
        code: "SUPER_ADMIN",
        scopeType: "GLOBAL",
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("_id")
        .lean();

      const superAdminRoleIds = superAdminRoles.map((role) => role._id);

      /**
       * Count OTHER active SUPER_ADMIN accesses.
       *
       * Excluding the target account makes the rule clearer:
       * there must be at least one other active Super Admin.
       */
      const otherActiveSuperAdminCount = await PlatformAccess.countDocuments({
        _id: {
          $ne: platformAccess._id,
        },

        roleId: {
          $in: superAdminRoleIds,
        },

        status: "ACTIVE",

        isDeleted: false,
      });

      if (otherActiveSuperAdminCount === 0) {
        throw new ApiError(
          400,
          "The last active Super Administrator cannot be deactivated or suspended.",
        );
      }
    }
  }

  platformAccess.status = status;

  platformAccess.updatedBy = actorId;

  await platformAccess.save();

  return getPopulatedPlatformAccess(platformAccessId);
};
/**
 * Reset Platform Administrator password.
 *
 * The User model's pre-save middleware should hash
 * the newly assigned password.
 */
export const resetPlatformAdminPassword = async (
  platformAccessId,
  password,
  actorId = null,
) => {
  const platformAccess = await PlatformAccess.findOne({
    _id: platformAccessId,
    isDeleted: false,
  })
    .select("_id userId status")
    .lean();

  if (!platformAccess) {
    throw new ApiError(404, "Platform administrator not found.");
  }

  const user = await User.findOne({
    _id: platformAccess.userId,
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(404, "Platform administrator user account not found.");
  }

  user.password = password;

  user.updatedBy = actorId;

  await user.save();

  return {
    platformAccessId: platformAccess._id,

    userId: user._id,
  };
};

/**
 * List active GLOBAL platform roles.
 *
 * Used when assigning a role to a Platform Administrator.
 */
export const listPlatformRoles = async () => {
  const roles = await Role.find({
    scopeType: "GLOBAL",
    status: "ACTIVE",
    isDeleted: false,
  })
    .select(
      "_id name code description scopeType status isSystemRole isEditable",
    )
    .sort({
      name: 1,
    })
    .lean();

  return {
    roles,
  };
};
