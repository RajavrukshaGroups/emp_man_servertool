import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import User from "../users/user.model.js";
import Role from "../roles/role.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";

import RefreshToken from "./refreshToken.model.js";

import {
  generateAccessToken,
  generateRefreshToken,
  getTokenExpiryDate,
  hashToken,
  verifyRefreshToken,
} from "./token.service.js";

const userPublicFields =
  "firstName middleName lastName displayName email mobile profilePhoto gender dateOfBirth status emailVerified mobileVerified lastLoginAt passwordChangedAt createdAt updatedAt";

const accessPopulate = [
  {
    path: "companyId",
    select: "name slug code logo status",
  },
  {
    path: "roleId",
    select: "name code description scopeType status permissionIds",
    populate: {
      path: "permissionIds",
      select: "name code module action description status",
    },
  },
];

/**
 * Normalize email/mobile login identifier.
 */
const normalizeIdentifier = (identifier) => {
  return identifier.trim().toLowerCase();
};

/**
 * Normalize IP address.
 */
const normalizeIpAddress = (ip = "") => {
  return ip.replace("::ffff:", "").slice(0, 100);
};

/**
 * Find user by email or mobile and include password.
 */
const findUserForAuthentication = async (identifier) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  const user = await User.findOne({
    isDeleted: false,
    $or: [
      {
        email: normalizedIdentifier,
      },
      {
        mobile: identifier.trim(),
      },
    ],
  }).select("+password");

  if (!user) {
    throw new ApiError(401, "Invalid email/mobile number or password.");
  }

  if (user.status === "INACTIVE") {
    throw new ApiError(
      403,
      "Your account is inactive. Please contact the administrator.",
    );
  }

  if (user.status === "SUSPENDED") {
    throw new ApiError(
      403,
      "Your account has been suspended. Please contact the administrator.",
    );
  }

  return user;
};

/**
 * Load active company access records for a user.
 */
const getActiveUserCompanyAccess = async (userId) => {
  return CompanyAccess.find({
    userId,
    isDeleted: false,
    status: "ACTIVE",
  })
    .populate(accessPopulate)
    .sort({
      isPrimaryCompany: -1,
      createdAt: 1,
    });
};

/**
 * Select the requested company access.
 */
const selectCompanyAccess = ({ accessRecords, companyId }) => {
  if (accessRecords.length === 0) {
    throw new ApiError(403, "You do not have active access to any company.");
  }

  if (companyId) {
    const selectedAccess = accessRecords.find(
      (access) => access.companyId?._id?.toString() === companyId.toString(),
    );

    if (!selectedAccess) {
      throw new ApiError(
        403,
        "You do not have active access to the selected company.",
      );
    }

    return selectedAccess;
  }

  const primaryAccess = accessRecords.find((access) => access.isPrimaryCompany);

  if (primaryAccess) {
    return primaryAccess;
  }

  if (accessRecords.length === 1) {
    return accessRecords[0];
  }

  throw new ApiError(
    409,
    "Multiple company accesses are available. Please select a company.",
    accessRecords.map((access) => ({
      companyAccessId: access._id,
      companyId: access.companyId?._id,
      companyName: access.companyId?.name,
      companyCode: access.companyId?.code,
      roleId: access.roleId?._id,
      roleName: access.roleId?.name,
      employeeCode: access.employeeCode,
      isPrimaryCompany: access.isPrimaryCompany,
    })),
  );
};

/**
 * Validate selected access, company and role.
 */
const validateSelectedCompanyAccess = (access) => {
  if (!access.companyId) {
    throw new ApiError(
      403,
      "The company assigned to this access no longer exists.",
    );
  }

  if (access.companyId.status !== "ACTIVE") {
    throw new ApiError(403, "The selected company is inactive.");
  }

  if (!access.roleId) {
    throw new ApiError(403, "No role is assigned to this company access.");
  }

  if (access.roleId.status !== "ACTIVE") {
    throw new ApiError(403, "The role assigned to this account is inactive.");
  }
};

/**
 * Create access and refresh tokens.
 */
const issueAuthenticationTokens = async ({
  user,
  companyAccess,
  rememberMe = false,
  ipAddress = "",
  userAgent = "",
  session = null,
}) => {
  const refreshTokenId = new mongoose.Types.ObjectId();

  const refreshToken = generateRefreshToken({
    userId: user._id,
    companyAccessId: companyAccess._id,
    tokenId: refreshTokenId,
    rememberMe,
  });

  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = getTokenExpiryDate(refreshToken);

  const refreshTokenRecord = {
    _id: refreshTokenId,
    userId: user._id,
    companyAccessId: companyAccess._id,
    tokenHash: refreshTokenHash,
    expiresAt,
    createdByIp: normalizeIpAddress(ipAddress),
    userAgent: userAgent.slice(0, 500),
  };

  if (session) {
    await RefreshToken.create([refreshTokenRecord], {
      session,
    });
  } else {
    await RefreshToken.create(refreshTokenRecord);
  }

  const accessToken = generateAccessToken({
    userId: user._id,
    companyAccessId: companyAccess._id,
    companyId: companyAccess.companyId._id ?? companyAccess.companyId,
    roleId: companyAccess.roleId._id ?? companyAccess.roleId,
    employeeCode: companyAccess.employeeCode,
  });

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
};

/**
 * Format the authentication response.
 */
const buildAuthenticationResponse = ({ user, companyAccess, accessToken }) => {
  const role = companyAccess.roleId;

  const permissions = Array.isArray(role?.permissionIds)
    ? role.permissionIds
        .filter((permission) => permission && permission.status === "ACTIVE")
        .map((permission) => ({
          _id: permission._id,
          name: permission.name,
          code: permission.code,
          module: permission.module,
          action: permission.action,
        }))
    : [];

  return {
    accessToken,

    user: {
      _id: user._id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      displayName: user.displayName,
      email: user.email,
      mobile: user.mobile,
      profilePhoto: user.profilePhoto,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      emailVerified: user.emailVerified,
      mobileVerified: user.mobileVerified,
      lastLoginAt: user.lastLoginAt,
    },

    companyAccess: {
      _id: companyAccess._id,
      employeeCode: companyAccess.employeeCode,
      designation: companyAccess.designation,
      employmentType: companyAccess.employmentType,
      departmentId: companyAccess.departmentId,
      teamId: companyAccess.teamId,
      reportingManagerId: companyAccess.reportingManagerId,
      joiningDate: companyAccess.joiningDate,
      workLocationType: companyAccess.workLocationType,
      workLocationName: companyAccess.workLocationName,
      isPrimaryCompany: companyAccess.isPrimaryCompany,
      status: companyAccess.status,
    },

    company: {
      _id: companyAccess.companyId._id,
      name: companyAccess.companyId.name,
      slug: companyAccess.companyId.slug,
      code: companyAccess.companyId.code,
      logo: companyAccess.companyId.logo,
      status: companyAccess.companyId.status,
    },

    role: {
      _id: role._id,
      name: role.name,
      code: role.code,
      scopeType: role.scopeType,
      permissions,
    },
  };
};

/**
 * Login using email/mobile and password.
 */
export const login = async ({
  identifier,
  password,
  companyId,
  rememberMe = false,
  ipAddress = "",
  userAgent = "",
}) => {
  const user = await findUserForAuthentication(identifier);

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email/mobile number or password.");
  }

  const accessRecords = await getActiveUserCompanyAccess(user._id);

  const companyAccess = selectCompanyAccess({
    accessRecords,
    companyId,
  });

  validateSelectedCompanyAccess(companyAccess);

  const tokens = await issueAuthenticationTokens({
    user,
    companyAccess,
    rememberMe,
    ipAddress,
    userAgent,
  });

  user.lastLoginAt = new Date();
  await user.save({
    validateBeforeSave: false,
  });

  return {
    data: buildAuthenticationResponse({
      user,
      companyAccess,
      accessToken: tokens.accessToken,
    }),

    refreshToken: tokens.refreshToken,

    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
};

/**
 * Rotate refresh token.
 */
export const refreshAuthenticationToken = async ({
  refreshToken,
  ipAddress = "",
  userAgent = "",
}) => {
  if (!refreshToken) {
    throw new ApiError(401, "Refresh token is required.");
  }

  const payload = verifyRefreshToken(refreshToken);

  const tokenHash = hashToken(refreshToken);

  const storedToken = await RefreshToken.findOne({
    _id: payload.jti,
    userId: payload.sub,
    companyAccessId: payload.accessId,
  }).select("+tokenHash");

  if (!storedToken) {
    throw new ApiError(401, "Refresh token is invalid or has already expired.");
  }

  if (storedToken.isRevoked || storedToken.revokedAt) {
    /*
     * Possible reuse of an already rotated token.
     * Revoke all sessions for safety.
     */
    await RefreshToken.updateMany(
      {
        userId: storedToken.userId,
        isRevoked: false,
      },
      {
        $set: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedByIp: normalizeIpAddress(ipAddress),
          revokeReason: "Refresh token reuse detected.",
        },
      },
    );

    throw new ApiError(
      401,
      "Refresh token has already been revoked. Please log in again.",
    );
  }

  if (storedToken.expiresAt <= new Date()) {
    throw new ApiError(401, "Refresh token has expired.");
  }

  if (storedToken.tokenHash !== tokenHash) {
    throw new ApiError(401, "Invalid refresh token.");
  }

  const [user, companyAccess] = await Promise.all([
    User.findOne({
      _id: payload.sub,
      status: "ACTIVE",
      isDeleted: false,
    }),

    CompanyAccess.findOne({
      _id: payload.accessId,
      userId: payload.sub,
      status: "ACTIVE",
      isDeleted: false,
    }).populate(accessPopulate),
  ]);

  if (!user) {
    throw new ApiError(401, "User account is unavailable.");
  }

  if (!companyAccess) {
    throw new ApiError(401, "Company access is unavailable.");
  }

  validateSelectedCompanyAccess(companyAccess);

  const session = await mongoose.startSession();

  try {
    let newTokens;

    await session.withTransaction(async () => {
      newTokens = await issueAuthenticationTokens({
        user,
        companyAccess,
        ipAddress,
        userAgent,
        session,
      });

      const replacementPayload = verifyRefreshToken(newTokens.refreshToken);

      storedToken.isRevoked = true;
      storedToken.revokedAt = new Date();
      storedToken.revokedByIp = normalizeIpAddress(ipAddress);
      storedToken.revokeReason = "Refresh token rotated.";
      storedToken.replacedByTokenId = replacementPayload.jti;

      await storedToken.save({
        session,
      });
    });

    return {
      data: buildAuthenticationResponse({
        user,
        companyAccess,
        accessToken: newTokens.accessToken,
      }),

      refreshToken: newTokens.refreshToken,

      refreshTokenExpiresAt: newTokens.refreshTokenExpiresAt,
    };
  } finally {
    await session.endSession();
  }
};

/**
 * Logout current session.
 */
export const logout = async ({ refreshToken, ipAddress = "" }) => {
  if (!refreshToken) {
    return;
  }

  let payload;

  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return;
  }

  await RefreshToken.findOneAndUpdate(
    {
      _id: payload.jti,
      userId: payload.sub,
      isRevoked: false,
    },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedByIp: normalizeIpAddress(ipAddress),
        revokeReason: "User logout.",
      },
    },
  );
};

/**
 * Logout from every device/session.
 */
export const logoutAll = async ({ userId, ipAddress = "" }) => {
  await RefreshToken.updateMany(
    {
      userId,
      isRevoked: false,
    },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedByIp: normalizeIpAddress(ipAddress),
        revokeReason: "User logged out from all devices.",
      },
    },
  );
};

/**
 * Get authenticated user profile.
 */
export const getAuthenticatedUser = async ({ userId, companyAccessId }) => {
  const [user, companyAccess] = await Promise.all([
    User.findOne({
      _id: userId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select(userPublicFields)
      .lean(),

    CompanyAccess.findOne({
      _id: companyAccessId,
      userId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .populate(accessPopulate)
      .lean(),
  ]);

  if (!user) {
    throw new ApiError(404, "Authenticated user not found.");
  }

  if (!companyAccess) {
    throw new ApiError(403, "Active company access not found.");
  }

  validateSelectedCompanyAccess(companyAccess);

  return buildAuthenticationResponse({
    user,
    companyAccess,
    accessToken: null,
  });
};

/**
 * Change authenticated user's password.
 */
export const changeAuthenticatedUserPassword = async ({
  userId,
  currentPassword,
  newPassword,
  ipAddress = "",
}) => {
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
  user.updatedBy = userId;

  await user.save();

  /*
   * Revoke every existing refresh token after password change.
   */
  await RefreshToken.updateMany(
    {
      userId,
      isRevoked: false,
    },
    {
      $set: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedByIp: normalizeIpAddress(ipAddress),
        revokeReason: "Password changed.",
      },
    },
  );

  return true;
};
