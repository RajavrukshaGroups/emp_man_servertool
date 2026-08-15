import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import User from "../modules/users/user.model.js";

import CompanyAccess from "../modules/company-access/companyAccess.model.js";

import PlatformAccess from "../modules/platform-access/platformAccess.model.js";

import { verifyAccessToken } from "../modules/auth/token.service.js";

/**
 * Extract Bearer token from Authorization header.
 */
const getBearerToken = (req) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    throw new ApiError(401, "Authorization token is required.");
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new ApiError(
      401,
      "Authorization header must use the Bearer token format.",
    );
  }

  return token;
};

/**
 * Get active permissions from populated role.
 */
const getActivePermissions = (role) => {
  return (
    role?.permissionIds
      ?.filter((permission) => permission && permission.status === "ACTIVE")
      .map((permission) => ({
        _id: permission._id,

        name: permission.name,

        code: permission.code,

        module: permission.module,

        action: permission.action,
      })) ?? []
  );
};

/**
 * Authenticate COMPANY-scoped user.
 */
const authenticateCompanyContext = async ({ payload, user }) => {
  const companyAccessId = payload.companyAccessId ?? payload.accessId;

  if (!companyAccessId) {
    throw new ApiError(
      401,
      "Company access information is missing from the access token.",
    );
  }

  if (!payload.companyId) {
    throw new ApiError(
      401,
      "Company information is missing from the access token.",
    );
  }

  const companyAccess = await CompanyAccess.findOne({
    _id: companyAccessId,

    userId: payload.sub,

    companyId: payload.companyId,

    status: "ACTIVE",

    isDeleted: false,
  })
    .populate({
      path: "companyId",

      select: "_id name code slug logo status",
    })
    .populate({
      path: "roleId",

      select: "_id name code scopeType status permissionIds companyId",

      populate: {
        path: "permissionIds",

        select: "_id name code module action status",
      },
    })
    .lean();

  if (!companyAccess) {
    throw new ApiError(403, "Company access is unavailable or inactive.");
  }

  if (!companyAccess.companyId || companyAccess.companyId.status !== "ACTIVE") {
    throw new ApiError(403, "Company is unavailable or inactive.");
  }

  if (!companyAccess.roleId || companyAccess.roleId.status !== "ACTIVE") {
    throw new ApiError(403, "Assigned role is unavailable or inactive.");
  }

  const companyBoundRoleScopes = ["COMPANY", "DEPARTMENT", "TEAM"];

  if (!companyBoundRoleScopes.includes(companyAccess.roleId.scopeType)) {
    throw new ApiError(403, "A company session requires a company-bound role.");
  }

  if (companyAccess.roleId._id.toString() !== payload.roleId?.toString()) {
    throw new ApiError(
      401,
      "Your role assignment has changed. Please log in again.",
    );
  }

  const activePermissions = getActivePermissions(companyAccess.roleId);

  return {
    userId: user._id,

    accessType: "COMPANY",

    accessId: companyAccess._id,

    companyAccessId: companyAccess._id,

    platformAccessId: null,

    companyId: companyAccess.companyId._id,

    roleId: companyAccess.roleId._id,

    employeeCode: companyAccess.employeeCode,

    roleCode: companyAccess.roleId.code,

    roleScopeType: companyAccess.roleId.scopeType,

    permissions: activePermissions,

    permissionCodes: activePermissions.map((permission) => permission.code),

    user,

    company: companyAccess.companyId,

    companyAccess,

    platformAccess: null,
  };
};

/**
 * Authenticate GLOBAL/platform user.
 */
const authenticateGlobalContext = async ({ payload, user }) => {
  const platformAccessId = payload.platformAccessId ?? payload.accessId;

  if (!platformAccessId) {
    throw new ApiError(
      401,
      "Platform access information is missing from the access token.",
    );
  }

  const platformAccess = await PlatformAccess.findOne({
    _id: platformAccessId,

    userId: payload.sub,

    status: "ACTIVE",

    isDeleted: false,
  })
    .populate({
      path: "roleId",

      select: "_id name code scopeType status permissionIds companyId",

      populate: {
        path: "permissionIds",

        select: "_id name code module action status",
      },
    })
    .lean();

  if (!platformAccess) {
    throw new ApiError(403, "Platform access is unavailable or inactive.");
  }

  if (!platformAccess.roleId || platformAccess.roleId.status !== "ACTIVE") {
    throw new ApiError(403, "Platform role is unavailable or inactive.");
  }

  if (platformAccess.roleId.scopeType !== "GLOBAL") {
    throw new ApiError(403, "A platform session requires a global role.");
  }

  if (platformAccess.roleId.companyId) {
    throw new ApiError(
      403,
      "A global platform role cannot belong to a company.",
    );
  }

  if (platformAccess.roleId._id.toString() !== payload.roleId?.toString()) {
    throw new ApiError(
      401,
      "Your platform role assignment has changed. Please log in again.",
    );
  }

  const activePermissions = getActivePermissions(platformAccess.roleId);

  return {
    userId: user._id,

    accessType: "GLOBAL",

    accessId: platformAccess._id,

    companyAccessId: null,

    platformAccessId: platformAccess._id,

    companyId: null,

    roleId: platformAccess.roleId._id,

    employeeCode: null,

    roleCode: platformAccess.roleId.code,

    roleScopeType: platformAccess.roleId.scopeType,

    permissions: activePermissions,

    permissionCodes: activePermissions.map((permission) => permission.code),

    user,

    company: null,

    companyAccess: null,

    platformAccess,
  };
};

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = getBearerToken(req);

  const payload = verifyAccessToken(token);

  if (payload.tokenType !== "ACCESS") {
    throw new ApiError(401, "Invalid access token type.");
  }

  const user = await User.findOne({
    _id: payload.sub,

    status: "ACTIVE",

    isDeleted: false,
  })
    .select(
      "_id firstName lastName displayName email mobile status passwordChangedAt",
    )
    .lean();

  if (!user) {
    throw new ApiError(401, "User account is unavailable.");
  }

  /**
   * Older tokens generated before accessType
   * was introduced are treated as company tokens.
   */
  const accessType = payload.accessType ?? "COMPANY";

  if (!["COMPANY", "GLOBAL"].includes(accessType)) {
    throw new ApiError(401, "Invalid authentication context.");
  }

  if (accessType === "GLOBAL") {
    req.user = await authenticateGlobalContext({
      payload,
      user,
    });
  } else {
    req.user = await authenticateCompanyContext({
      payload,
      user,
    });
  }

  next();
});

export default authenticate;
