import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";
import AttendancePhotoEvidence from "./attendancePhotoEvidence.model.js";

export const consumeAttendancePhotoEvidence = async ({
  evidenceId,
  companyId,
  companyAccessId,
  action,
  attendanceId,
  workSessionId = null,
  fieldVisitId = null,
  session,
  currentTime = new Date(),
}) => {
  if (!session) {
    throw new ApiError(
      500,
      "A database transaction is required to consume photo evidence.",
    );
  }

  if (!mongoose.isValidObjectId(evidenceId)) {
    throw new ApiError(400, "Invalid photo evidence ID.");
  }

  const query = {
    _id: evidenceId,
    companyId,
    companyAccessId,
    action,
    status: "PENDING",
    expiresAt: { $gt: currentTime },
    attendanceId,
    workSessionId,
    fieldVisitId,
  };

  const evidence = await AttendancePhotoEvidence.findOneAndUpdate(
    query,
    {
      $set: {
        status: "CONSUMED",
        consumedAt: currentTime,
      },
    },
    {
      returnDocument: "after",
      session,
    },
  ).select("+imagePublicId +imageAssetId");

  if (!evidence) {
    throw new ApiError(
      409,
      "Photo evidence is invalid, expired, already consumed, or does not match this attendance action.",
    );
  }

  return {
    status: "CAPTURED",
    imagePublicId: evidence.imagePublicId,
    imageAssetId: evidence.imageAssetId,
    capturedAt: evidence.capturedAt,
  };
};

export const consumeCheckInPhotoEvidence = async ({
  evidenceId,
  companyId,
  companyAccessId,
  attendanceId,
  workSessionId,
  session,
  currentTime = new Date(),
}) => {
  if (!session || !session.inTransaction()) {
    throw new ApiError(
      500,
      "An active database transaction is required to consume check-in photo evidence.",
    );
  }

  if (!mongoose.isValidObjectId(evidenceId)) {
    throw new ApiError(400, "Invalid photo evidence ID.");
  }

  if (
    !mongoose.isValidObjectId(attendanceId) ||
    !mongoose.isValidObjectId(workSessionId)
  ) {
    throw new ApiError(
      500,
      "Valid attendance and work-session IDs are required.",
    );
  }

  const evidence = await AttendancePhotoEvidence.findOneAndUpdate(
    {
      _id: evidenceId,
      companyId,
      companyAccessId,
      action: "CHECK_IN",
      status: "PENDING",
      expiresAt: { $gt: currentTime },

      // CHECK_IN uploads must initially be unbound.
      attendanceId: null,
      workSessionId: null,
      fieldVisitId: null,
    },
    {
      $set: {
        status: "CONSUMED",
        consumedAt: currentTime,
        attendanceId,
        workSessionId,
      },
    },
    {
      returnDocument: "after",
      session,
    },
  ).select("+imagePublicId +imageAssetId");

  if (!evidence) {
    throw new ApiError(
      409,
      "Check-in photo evidence is invalid, expired, already consumed, or does not belong to this employee.",
    );
  }

  return {
    status: "CAPTURED",
    imagePublicId: evidence.imagePublicId,
    imageAssetId: evidence.imageAssetId,
    capturedAt: evidence.capturedAt,
  };
};
