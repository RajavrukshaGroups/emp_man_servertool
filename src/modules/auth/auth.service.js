import mongoose from "mongoose";

import crypto from "node:crypto";

import { env } from "../../config/env.js";
import { sendEmail } from "../../services/email.service.js";

import PasswordResetToken from "./passwordResetToken.model.js";

import { ApiError } from "../../utils/ApiError.js";

import User from "../users/user.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Company from "../companies/company.model.js";
import CompanyEmailSettings from "../company-email-settings/companyEmailSettings.model.js";

import RefreshToken from "./refreshToken.model.js";
import PlatformAccess from "../platform-access/platformAccess.model.js";

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

  {
    path: "attendanceLocationId",
    select:
      "name code locationType latitude longitude geofenceRadiusMeters allowCheckIn allowCheckOut status",
  },
];

const platformAccessPopulate = [
  {
    path: "roleId",
    select: "name code description scopeType status permissionIds companyId",
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

const getActiveUserPlatformAccess = async (userId) => {
  return PlatformAccess.findOne({
    userId,
    isDeleted: false,
    status: "ACTIVE",
  }).populate(platformAccessPopulate);
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

const validateSelectedPlatformAccess = (platformAccess) => {
  if (!platformAccess) {
    throw new ApiError(403, "Active platform access is unavailable.");
  }

  if (!platformAccess.roleId) {
    throw new ApiError(403, "No platform role is assigned to this account.");
  }

  if (platformAccess.roleId.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "The platform role assigned to this account is inactive.",
    );
  }

  if (platformAccess.roleId.scopeType !== "GLOBAL") {
    throw new ApiError(403, "Platform access requires a GLOBAL role.");
  }

  if (platformAccess.roleId.companyId) {
    throw new ApiError(403, "A GLOBAL role cannot belong to a company.");
  }
};

/**
 * Create access and refresh tokens.
 */
const issueAuthenticationTokens = async ({
  user,

  accessType,

  companyAccess = null,
  platformAccess = null,

  rememberMe = false,

  ipAddress = "",

  userAgent = "",

  session = null,
}) => {
  const refreshTokenId = new mongoose.Types.ObjectId();

  const isGlobal = accessType === "GLOBAL";

  const accessRecord = isGlobal ? platformAccess : companyAccess;

  if (!accessRecord) {
    throw new ApiError(
      500,
      `${isGlobal ? "Platform" : "Company"} access is required.`,
    );
  }

  const refreshToken = generateRefreshToken({
    userId: user._id,

    accessType,

    companyAccessId: companyAccess?._id ?? null,

    platformAccessId: platformAccess?._id ?? null,

    tokenId: refreshTokenId,

    rememberMe,
  });

  const refreshTokenHash = hashToken(refreshToken);

  const expiresAt = getTokenExpiryDate(refreshToken);

  const refreshTokenRecord = {
    _id: refreshTokenId,

    userId: user._id,

    accessType,

    companyAccessId: companyAccess?._id ?? null,

    platformAccessId: platformAccess?._id ?? null,

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

  const role = accessRecord.roleId;

  const accessToken = generateAccessToken({
    userId: user._id,

    accessType,

    companyAccessId: companyAccess?._id ?? null,

    platformAccessId: platformAccess?._id ?? null,

    companyId:
      companyAccess?.companyId?._id ?? companyAccess?.companyId ?? null,

    roleId: role?._id ?? role,

    employeeCode: companyAccess?.employeeCode ?? null,
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
    accessType: "COMPANY",
    platformAccess: null,

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

      attendanceMode: companyAccess.attendanceMode,

      shiftId: companyAccess.shiftId,

      attendanceLocationId:
        companyAccess.attendanceLocationId?._id ??
        companyAccess.attendanceLocationId ??
        null,

      attendanceLocation: companyAccess.attendanceLocationId
        ? {
            _id:
              companyAccess.attendanceLocationId?._id ??
              companyAccess.attendanceLocationId,

            name: companyAccess.attendanceLocationId?.name ?? "",

            code: companyAccess.attendanceLocationId?.code ?? "",

            locationType:
              companyAccess.attendanceLocationId?.locationType ?? null,

            latitude: companyAccess.attendanceLocationId?.latitude ?? null,

            longitude: companyAccess.attendanceLocationId?.longitude ?? null,

            geofenceRadiusMeters:
              companyAccess.attendanceLocationId?.geofenceRadiusMeters ?? null,

            allowCheckIn:
              companyAccess.attendanceLocationId?.allowCheckIn ?? false,

            allowCheckOut:
              companyAccess.attendanceLocationId?.allowCheckOut ?? false,

            status: companyAccess.attendanceLocationId?.status ?? null,
          }
        : null,

      attendanceLocationPolicy: {
        checkIn:
          companyAccess.attendanceLocationPolicy?.checkIn ??
          "GEOFENCE_REQUIRED",

        checkOut:
          companyAccess.attendanceLocationPolicy?.checkOut ??
          "GEOFENCE_REQUIRED",
      },

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

const buildPlatformAuthenticationResponse = ({
  user,
  platformAccess,
  accessToken,
}) => {
  const role = platformAccess.roleId;

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

    accessType: "GLOBAL",

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

    platformAccess: {
      _id: platformAccess._id,

      status: platformAccess.status,
    },

    companyAccess: null,

    company: null,

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

  const platformAccess = await getActiveUserPlatformAccess(user._id);

  if (platformAccess) {
    validateSelectedPlatformAccess(platformAccess);

    const tokens = await issueAuthenticationTokens({
      user,

      accessType: "GLOBAL",

      platformAccess,

      rememberMe,

      ipAddress,

      userAgent,
    });

    user.lastLoginAt = new Date();

    await user.save({
      validateBeforeSave: false,
    });

    return {
      data: buildPlatformAuthenticationResponse({
        user,

        platformAccess,

        accessToken: tokens.accessToken,
      }),

      refreshToken: tokens.refreshToken,

      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    };
  }
  const accessRecords = await getActiveUserCompanyAccess(user._id);

  const companyAccess = selectCompanyAccess({
    accessRecords,

    companyId,
  });

  validateSelectedCompanyAccess(companyAccess);

  const tokens = await issueAuthenticationTokens({
    user,

    accessType: "COMPANY",

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
  }).select("+tokenHash");

  if (!storedToken) {
    throw new ApiError(401, "Refresh token is invalid or has already expired.");
  }

  if (storedToken.isRevoked || storedToken.revokedAt) {
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

  const accessType = storedToken.accessType ?? payload.accessType ?? "COMPANY";

  const user = await User.findOne({
    _id: payload.sub,
    status: "ACTIVE",
    isDeleted: false,
  });

  if (!user) {
    throw new ApiError(401, "User account is unavailable.");
  }

  /**
   * Reject refresh tokens issued before the latest password change.
   */
  if (user.passwordChangedAt) {
    const passwordChangedAtSeconds = Math.floor(
      new Date(user.passwordChangedAt).getTime() / 1000,
    );

    if (
      !Number.isInteger(payload.iat) ||
      payload.iat <= passwordChangedAtSeconds
    ) {
      throw new ApiError(
        401,
        "Your password has changed. Please log in again.",
      );
    }
  }

  let companyAccess = null;
  let platformAccess = null;

  if (accessType === "GLOBAL") {
    const platformAccessId =
      storedToken.platformAccessId ??
      payload.platformAccessId ??
      payload.accessId;

    platformAccess = await PlatformAccess.findOne({
      _id: platformAccessId,
      userId: payload.sub,
      status: "ACTIVE",
      isDeleted: false,
    }).populate(platformAccessPopulate);

    if (!platformAccess) {
      throw new ApiError(401, "Platform access is unavailable.");
    }

    validateSelectedPlatformAccess(platformAccess);
  } else {
    const companyAccessId =
      storedToken.companyAccessId ??
      payload.companyAccessId ??
      payload.accessId;

    companyAccess = await CompanyAccess.findOne({
      _id: companyAccessId,
      userId: payload.sub,
      status: "ACTIVE",
      isDeleted: false,
    }).populate(accessPopulate);

    if (!companyAccess) {
      throw new ApiError(401, "Company access is unavailable.");
    }

    validateSelectedCompanyAccess(companyAccess);
  }

  const session = await mongoose.startSession();

  try {
    let newTokens;

    await session.withTransaction(async () => {
      newTokens = await issueAuthenticationTokens({
        user,

        accessType,

        companyAccess,

        platformAccess,

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

    const data =
      accessType === "GLOBAL"
        ? buildPlatformAuthenticationResponse({
            user,
            platformAccess,
            accessToken: newTokens.accessToken,
          })
        : buildAuthenticationResponse({
            user,
            companyAccess,
            accessToken: newTokens.accessToken,
          });

    return {
      data,

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
export const getAuthenticatedUser = async ({
  userId,

  accessType = "COMPANY",

  companyAccessId = null,

  platformAccessId = null,
}) => {
  const user = await User.findOne({
    _id: userId,
    status: "ACTIVE",
    isDeleted: false,
  })
    .select(userPublicFields)
    .lean();

  if (!user) {
    throw new ApiError(404, "Authenticated user not found.");
  }

  if (accessType === "GLOBAL") {
    const platformAccess = await PlatformAccess.findOne({
      _id: platformAccessId,

      userId,

      status: "ACTIVE",

      isDeleted: false,
    })
      .populate(platformAccessPopulate)
      .lean();

    if (!platformAccess) {
      throw new ApiError(403, "Active platform access not found.");
    }

    validateSelectedPlatformAccess(platformAccess);

    return buildPlatformAuthenticationResponse({
      user,

      platformAccess,

      accessToken: null,
    });
  }

  const companyAccess = await CompanyAccess.findOne({
    _id: companyAccessId,

    userId,

    status: "ACTIVE",

    isDeleted: false,
  })
    .populate(accessPopulate)
    .lean();

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

/**
 * Request a password reset link.
 * Always returns the same public response to prevent
 * revealing whether an email address is registered.
 */
export const requestPasswordReset = async ({ email, ipAddress = "" }) => {
  const publicMessage =
    "If an account exists with this email address, a password reset link will be sent.";

  const normalizedEmail = email.trim().toLowerCase();

  const user = await User.findOne({
    email: normalizedEmail,
    status: "ACTIVE",
    isDeleted: false,
  });

  if (!user) {
    return publicMessage;
  }

  /**
   * Find the user's active company memberships.
   *
   * Prefer the primary company, followed by the oldest
   * membership, with _id as a stable tie-breaker.
   */
  const companyAccesses = await CompanyAccess.find({
    userId: user._id,
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("companyId isPrimaryCompany")
    .sort({
      isPrimaryCompany: -1,
      createdAt: 1,
      _id: 1,
    })
    .lean();

  if (companyAccesses.length === 0) {
    return publicMessage;
  }

  const companyIds = companyAccesses.map((access) => access.companyId);

  /**
   * Only active companies with verified and enabled
   * email settings are eligible to send reset emails.
   */
  const [companies, emailSettings] = await Promise.all([
    Company.find({
      _id: { $in: companyIds },
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id name slug")
      .lean(),

    CompanyEmailSettings.find({
      companyId: { $in: companyIds },
      isEnabled: true,
      isVerified: true,
    })
      .select("companyId")
      .lean(),
  ]);

  const activeCompanyIds = new Set(
    companies.map((company) => company._id.toString()),
  );

  const emailEnabledCompanyIds = new Set(
    emailSettings.map((settings) => settings.companyId.toString()),
  );

  /**
   * Choose the first eligible membership in the
   * previously established priority order.
   */
  const selectedAccess = companyAccesses.find((access) => {
    const companyId = access.companyId.toString();

    return (
      activeCompanyIds.has(companyId) && emailEnabledCompanyIds.has(companyId)
    );
  });

  if (!selectedAccess) {
    return publicMessage;
  }

  const company = companies.find(
    (item) => item._id.toString() === selectedAccess.companyId.toString(),
  );

  if (!company) {
    return publicMessage;
  }

  /**
   * Confirm that this user has active access
   * to the selected company.
   */
  const companyAccess = await CompanyAccess.exists({
    userId: user._id,
    companyId: company._id,
    status: "ACTIVE",
    isDeleted: false,
  });

  if (!companyAccess) {
    return publicMessage;
  }

  /**
   * Prevent repeated password reset requests for the same account.
   * Keep the response generic to avoid exposing account existence.
   */
  const PASSWORD_RESET_COOLDOWN_MS = 5 * 60 * 1000;

  const recentResetRequest = await PasswordResetToken.findOne({
    userId: user._id,
    createdAt: {
      $gt: new Date(Date.now() - PASSWORD_RESET_COOLDOWN_MS),
    },
  }).lean();

  if (recentResetRequest) {
    return publicMessage;
  }

  // Generate a cryptographically secure reset token.
  const rawToken = crypto.randomBytes(32).toString("hex");

  // Never store the raw reset token in MongoDB.
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  /**
   * Remove expired or consumed reset records before creating a new one.
   * Do not invalidate an existing unexpired, unused link.
   */
  await PasswordResetToken.deleteMany({
    userId: user._id,
    $or: [{ expiresAt: { $lte: new Date() } }, { usedAt: { $ne: null } }],
  });

  let resetTokenRecord;

  try {
    resetTokenRecord = await PasswordResetToken.create({
      userId: user._id,
      companyId: company._id,
      tokenHash,
      expiresAt,
      createdByIp: ipAddress.replace("::ffff:", "").slice(0, 100),
    });
  } catch (error) {
    if (error.code === 11000) {
      // Another unused token already exists.
      // Return the same response to avoid exposing account information.
      return publicMessage;
    }

    throw error;
  }

  const resetUrl = new URL("/reset-password", env.CLIENT_URL);
  resetUrl.searchParams.set("token", rawToken);

  const displayName = user.firstName || user.displayName || "Employee";

  const subject = "Reset Your Employee Management Password";

  const text = [
    `Hello ${displayName},`,
    "",
    "We received a request to reset your Employee Management password.",
    "",
    `Reset your password using this link: ${resetUrl.toString()}`,
    "",
    "This link expires in 15 minutes and can only be used once.",
    "",
    "If you did not request this reset, you can ignore this email.",
    "",
    "Employee Management System",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;">
      <h2>Password Reset Request</h2>
      <p>Hello ${escapeHtml(displayName)},</p>
      <p>We received a request to reset your Employee Management password.</p>
      <p>
        <a href="${escapeHtml(resetUrl.toString())}"
           style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>This link expires in <strong>15 minutes</strong> and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  try {
    await sendEmail({
      companyId: company._id,
      to: user.email,
      subject,
      text,
      html,
    });
  } catch (error) {
    // Prevent a failed email attempt from leaving an active reset link.
    await PasswordResetToken.deleteOne({
      _id: resetTokenRecord._id,
    });

    // Do not log reset URLs, tokens, or email contents.
    console.error("Password reset email delivery failed.");

    return publicMessage;
  }

  return publicMessage;
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });

/**
 * Reset a user's password using a one-time recovery token.
 */
export const resetUserPassword = async ({
  token,
  newPassword,
  ipAddress = "",
}) => {
  const invalidTokenMessage =
    "Password reset link is invalid, expired, or already used.";

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const session = await mongoose.startSession();

  let userEmail = null;
  let userName = null;

  let resetCompanyId = null;

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      // Atomically claim the token.
      const resetRecord = await PasswordResetToken.findOneAndUpdate(
        {
          tokenHash,
          usedAt: null,
          expiresAt: { $gt: now },
        },
        {
          $set: { usedAt: now },
        },
        {
          new: true,
          session,
        },
      );

      if (!resetRecord) {
        throw new ApiError(400, invalidTokenMessage);
      }

      const user = await User.findOne({
        _id: resetRecord.userId,
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("+password")
        .session(session);

      if (!user) {
        throw new ApiError(400, invalidTokenMessage);
      }

      const isSamePassword = await user.comparePassword(newPassword);

      if (isSamePassword) {
        throw new ApiError(
          400,
          "New password must be different from the current password.",
        );
      }

      user.password = newPassword;
      user.updatedBy = user._id;

      // User model hashes the password automatically.
      await user.save({ session });

      // Revoke every existing refresh session.
      await RefreshToken.updateMany(
        {
          userId: user._id,
          isRevoked: false,
        },
        {
          $set: {
            isRevoked: true,
            revokedAt: now,
            revokedByIp: ipAddress.replace("::ffff:", "").slice(0, 100),
            revokeReason: "Password reset.",
          },
        },
        { session },
      );

      // Invalidate any other outstanding reset links.
      await PasswordResetToken.updateMany(
        {
          userId: user._id,
          usedAt: null,
        },
        {
          $set: { usedAt: now },
        },
        { session },
      );

      userEmail = user.email;
      userName = user.firstName || user.displayName;
      resetCompanyId = resetRecord.companyId;
    });

    // Send notification only after the transaction commits.
    try {
      await sendEmail({
        companyId: resetCompanyId,
        to: userEmail,
        subject: "Your Employee Management Password Was Reset",
        text: [
          `Hello ${userName || "Employee"},`,
          "",
          "Your Employee Management account password was successfully reset.",
          "",
          "If you did not make this change, contact your company administrator immediately.",
          "",
          "Employee Management System",
        ].join("\n"),
      });
    } catch {
      // Email failure must not undo a successful password reset.
      console.error("Password reset confirmation email failed.");
    }

    return true;
  } finally {
    await session.endSession();
  }
};
