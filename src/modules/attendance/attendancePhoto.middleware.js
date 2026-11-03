import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * ATTENDANCE PHOTO COMPANY CONTEXT
 * ============================================================
 *
 * Photo uploads must belong to the authenticated
 * employee's active company access.
 *
 * Authentication and company-context middleware must
 * execute before this middleware.
 */
export const requireAttendancePhotoCompanyContext = (req, _res, next) => {
  const user = req.user;

  if (
    user?.accessType !== "COMPANY" ||
    !user.companyId ||
    !user.companyAccessId ||
    !user.userId
  ) {
    throw new ApiError(
      403,
      "An active company employee session is required for attendance photo capture.",
    );
  }

  if (String(req.params?.companyId) !== String(user.companyId)) {
    throw new ApiError(
      403,
      "Attendance photo capture is not permitted for another company.",
    );
  }

  return next();
};
