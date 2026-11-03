import { ApiError } from "../../utils/ApiError.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";

/**
 * Permission required for each attendance photo action.
 */
const PHOTO_ACTION_PERMISSIONS = Object.freeze({
  CHECK_IN: PERMISSIONS.ATTENDANCE_CHECK_IN,
  CHECK_OUT: PERMISSIONS.ATTENDANCE_CHECK_OUT,
  FIELD_VISIT_START: PERMISSIONS.ATTENDANCE_FIELD_VISIT_CREATE,
  FIELD_VISIT_END: PERMISSIONS.ATTENDANCE_FIELD_VISIT_UPDATE,
});

/**
 * ============================================================
 * AUTHORIZE ATTENDANCE PHOTO EVIDENCE
 * ============================================================
 *
 * Must execute after:
 * 1. authenticate
 * 2. enforceCompanyContext
 * 3. multipart upload parsing
 *
 * Must execute before:
 * - Cloudinary upload
 * - Evidence creation
 */
export const authorizeAttendancePhotoEvidence = (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication is required."));
  }

  const action = req.validated?.body?.action;

  const requiredPermission = PHOTO_ACTION_PERMISSIONS[action];

  if (!requiredPermission) {
    return next(new ApiError(400, "Unsupported attendance photo action."));
  }

  const userPermissions = new Set(req.user.permissionCodes ?? []);

  if (!userPermissions.has(requiredPermission)) {
    return next(
      new ApiError(
        403,
        "You do not have permission to upload photo evidence for this attendance action.",
      ),
    );
  }

  return next();
};

/**
 * ============================================================
 * AUTHORIZE ATTENDANCE PHOTO REQUIREMENT
 * ============================================================
 *
 * GET requests provide the action in validated query parameters.
 * The existing upload authorization remains unchanged.
 */
export const authorizeAttendancePhotoRequirement = (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication is required."));
  }

  const action = req.validated?.query?.action;

  const requiredPermission = PHOTO_ACTION_PERMISSIONS[action];

  if (!requiredPermission) {
    return next(new ApiError(400, "Unsupported attendance photo action."));
  }

  const userPermissions = new Set(req.user.permissionCodes ?? []);

  if (!userPermissions.has(requiredPermission)) {
    return next(
      new ApiError(
        403,
        "You do not have permission to check photo requirements for this attendance action.",
      ),
    );
  }

  return next();
};
