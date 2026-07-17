import { ApiError } from "../utils/ApiError.js";

/**
 * Require every supplied permission.
 *
 * Example:
 * authorizeAll(
 *   "employee.read",
 *   "employee.update",
 * )
 */
export const authorizeAll =
  (...requiredPermissions) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication is required."));
    }

    if (requiredPermissions.length === 0) {
      return next();
    }

    const userPermissions = new Set(req.user.permissionCodes ?? []);

    const missingPermissions = requiredPermissions.filter(
      (permission) => !userPermissions.has(permission),
    );

    if (missingPermissions.length > 0) {
      return next(
        new ApiError(
          403,
          `Missing required permission(s): ${missingPermissions.join(", ")}.`,
        ),
      );
    }

    return next();
  };

/**
 * Require at least one supplied permission.
 *
 * Example:
 * authorizeAny(
 *   "employee.read",
 *   "employee.manage",
 * )
 */
export const authorizeAny =
  (...requiredPermissions) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication is required."));
    }

    if (requiredPermissions.length === 0) {
      return next();
    }

    const userPermissions = new Set(req.user.permissionCodes ?? []);

    const hasPermission = requiredPermissions.some((permission) =>
      userPermissions.has(permission),
    );

    if (!hasPermission) {
      return next(
        new ApiError(
          403,
          `At least one permission is required: ${requiredPermissions.join(", ")}.`,
        ),
      );
    }

    return next();
  };

/**
 * Default authorization helper.
 *
 * For one permission:
 * authorize("employee.create")
 *
 * For several permissions, all are required:
 * authorize(
 *   "employee.read",
 *   "employee.update",
 * )
 */
export const authorize = authorizeAll;

/**
 * Restrict access using role codes.
 *
 * This should be used sparingly.
 * Permission-based authorization is preferred.
 */
export const authorizeRoles =
  (...allowedRoleCodes) =>
  (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication is required."));
    }

    if (!allowedRoleCodes.includes(req.user.roleCode)) {
      return next(
        new ApiError(403, "Your role is not allowed to perform this action."),
      );
    }

    return next();
  };
