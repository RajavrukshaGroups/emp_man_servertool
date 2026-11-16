import { ApiError } from "../utils/ApiError.js";

/**
 * Restrict an endpoint to authenticated platform access.
 *
 * Effective permissions must still be checked separately
 * using authorize(...).
 */
export const requirePlatformContext = (req, _res, next) => {
  const actor = req.user;

  if (!actor) {
    return next(new ApiError(401, "Authentication is required."));
  }

  if (
    actor.accessType !== "GLOBAL" ||
    actor.roleScopeType !== "GLOBAL" ||
    !actor.platformAccessId ||
    !actor.platformAccess
  ) {
    return next(
      new ApiError(403, "Valid platform access context is required."),
    );
  }

  return next();
};
