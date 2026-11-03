import { ApiError } from "../../utils/ApiError.js";

/**
 * Verify that photo evidence belongs to the
 * authenticated employee and requested action.
 *
 * This is an additional defensive check.
 * Authentication and permissions are enforced separately.
 */
export const assertPhotoEvidenceOwnership = ({
  evidence,
  companyId,
  companyAccessId,
  action,
  attendanceId = null,
  workSessionId = null,
  fieldVisitId = null,
}) => {
  if (!evidence) {
    throw new ApiError(404, "Attendance photo evidence was not found.");
  }

  const sameId = (first, second) =>
    first != null && second != null && String(first) === String(second);

  if (
    !sameId(evidence.companyId, companyId) ||
    !sameId(evidence.companyAccessId, companyAccessId) ||
    evidence.action !== action
  ) {
    throw new ApiError(
      403,
      "Attendance photo evidence does not belong to this action or employee.",
    );
  }

  if (attendanceId != null && !sameId(evidence.attendanceId, attendanceId)) {
    throw new ApiError(
      403,
      "Attendance photo evidence does not match this attendance record.",
    );
  }

  if (workSessionId != null && !sameId(evidence.workSessionId, workSessionId)) {
    throw new ApiError(
      403,
      "Attendance photo evidence does not match this work session.",
    );
  }

  if (fieldVisitId != null && !sameId(evidence.fieldVisitId, fieldVisitId)) {
    throw new ApiError(
      403,
      "Attendance photo evidence does not match this field visit.",
    );
  }

  if (
    evidence.status !== "PENDING" ||
    !evidence.expiresAt ||
    new Date(evidence.expiresAt).getTime() <= Date.now()
  ) {
    throw new ApiError(
      409,
      "Attendance photo evidence has expired or has already been used.",
    );
  }

  return true;
};
