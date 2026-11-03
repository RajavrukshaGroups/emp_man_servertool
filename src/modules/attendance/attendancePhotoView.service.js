
import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";
import Attendance from "./attendance.model.js";

import {
  canAccessCompanyAccess,
} from "./attendance.scope.js";

const PHOTO_FIELDS = Object.freeze({
  CHECK_IN: "checkInPhotoEvidence",
  CHECK_OUT: "checkOutPhotoEvidence",
});

export const getAuthorizedAttendancePhotoEvidence = async ({
  companyId,
  attendanceId,
  sessionId,
  action,
  requesterContext,
}) => {
  if (
    !mongoose.isObjectIdOrHexString(companyId) ||
    !mongoose.isObjectIdOrHexString(attendanceId) ||
    !mongoose.isObjectIdOrHexString(sessionId)
  ) {
    throw new ApiError(400, "Invalid attendance photo request.");
  }

  const evidenceField = PHOTO_FIELDS[action];

  if (!evidenceField) {
    throw new ApiError(400, "Invalid attendance photo action.");
  }

  // Retrieve the attendance record and protected evidence together.
  const attendance = await Attendance.findOne({
    _id: attendanceId,
    companyId,
    isDeleted: false,
    "workSessions._id": sessionId,
  })
    .select(
      "+workSessions.checkInPhotoEvidence.imagePublicId " +
      "+workSessions.checkInPhotoEvidence.imageAssetId " +
      "+workSessions.checkOutPhotoEvidence.imagePublicId " +
      "+workSessions.checkOutPhotoEvidence.imageAssetId",
    )
    .lean();

  if (!attendance) {
    throw new ApiError(404, "Attendance photo evidence not found.");
  }

  // Authorize against the same attendance record.
  const allowed = await canAccessCompanyAccess({
    requesterContext,
    companyId,
    targetCompanyAccessId: attendance.companyAccessId,
  });

  if (!allowed) {
    throw new ApiError(
      403,
      "You are not allowed to view this attendance photograph.",
    );
  }

  const session = attendance.workSessions?.find(
    (item) => String(item._id) === String(sessionId),
  );

  if (!session) {
    throw new ApiError(404, "Attendance work session not found.");
  }

  const evidence = session[evidenceField];

  if (
    evidence?.status !== "CAPTURED" ||
    !evidence.imagePublicId ||
    !evidence.imageAssetId
  ) {
    throw new ApiError(
      404,
      "Captured attendance photo not found.",
    );
  }

  // Ensure the image belongs to the requested company.
  const expectedPrefix =
    `employee-management/attendance/photo-evidence/${companyId}/`;

  if (!evidence.imagePublicId.startsWith(expectedPrefix)) {
    throw new ApiError(
      404,
      "Attendance photo evidence not found.",
    );
  }

  return {
    imagePublicId: evidence.imagePublicId,
    imageAssetId: evidence.imageAssetId,
    capturedAt: evidence.capturedAt,
    action,
    sessionId,
    attendanceId,
  };
};
