import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import User from "../modules/users/user.model.js";
import CompanyAccess from "../modules/company-access/companyAccess.model.js";

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

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = getBearerToken(req);

  const payload = verifyAccessToken(token);

  if (payload.tokenType !== "ACCESS") {
    throw new ApiError(401, "Invalid access token type.");
  }

  const [user, companyAccess] = await Promise.all([
    User.findOne({
      _id: payload.sub,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select(
        "_id firstName lastName displayName email mobile status passwordChangedAt",
      )
      .lean(),

    CompanyAccess.findOne({
      _id: payload.accessId,
      userId: payload.sub,
      companyId: payload.companyId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .populate({
        path: "companyId",
        select: "_id name code slug status",
      })
      .populate({
        path: "roleId",
        select: "_id name code scopeType status permissionIds companyId",
        populate: {
          path: "permissionIds",
          select: "_id name code module action status",
        },
      })
      .lean(),
  ]);

  if (!user) {
    throw new ApiError(401, "User account is unavailable.");
  }

  if (!companyAccess) {
    throw new ApiError(403, "Company access is unavailable or inactive.");
  }

  if (!companyAccess.companyId || companyAccess.companyId.status !== "ACTIVE") {
    throw new ApiError(403, "Company is unavailable or inactive.");
  }

  if (!companyAccess.roleId || companyAccess.roleId.status !== "ACTIVE") {
    throw new ApiError(403, "Assigned role is unavailable or inactive.");
  }

  /*
   * Ensure token role still matches current database role.
   * This prevents an old token from silently representing
   * a previously assigned role.
   */
  if (companyAccess.roleId._id.toString() !== payload.roleId.toString()) {
    throw new ApiError(
      401,
      "Your role assignment has changed. Please log in again.",
    );
  }

  const activePermissions =
    companyAccess.roleId.permissionIds
      ?.filter((permission) => permission && permission.status === "ACTIVE")
      .map((permission) => ({
        _id: permission._id,
        name: permission.name,
        code: permission.code,
        module: permission.module,
        action: permission.action,
      })) ?? [];

  req.user = {
    userId: user._id,

    companyAccessId: companyAccess._id,

    accessId: companyAccess._id,

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
  };

  console.log("AUTH USER:");
  console.dir(req.user, { depth: null });
  next();
});

export default authenticate;
