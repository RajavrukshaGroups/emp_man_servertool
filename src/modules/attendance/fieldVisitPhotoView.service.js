import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";
import FieldVisit from "./fieldVisit.model.js";
import { canAccessCompanyAccess } from "./attendance.scope.js";

const PHOTO_FIELDS = Object.freeze({
  START: "startPhotoEvidence",
  END: "endPhotoEvidence",
});

export const getAuthorizedFieldVisitPhotoEvidence = async ({
  companyId,
  fieldVisitId,
  action,
  requesterContext,
}) => {
  if (
    !mongoose.isObjectIdOrHexString(companyId) ||
    !mongoose.isObjectIdOrHexString(fieldVisitId)
  ) {
    throw new ApiError(400, "Invalid field visit photo request.");
  }

  const evidenceField = PHOTO_FIELDS[action];

  if (!evidenceField) {
    throw new ApiError(400, "Invalid field visit photo action.");
  }

  // Retrieve only the requested visit from the correct company.
  const fieldVisit = await FieldVisit.findOne({
    _id: fieldVisitId,
    companyId,
    isDeleted: false,
  })
    .select(
      "+startPhotoEvidence.imagePublicId " +
        "+startPhotoEvidence.imageAssetId " +
        "+endPhotoEvidence.imagePublicId " +
        "+endPhotoEvidence.imageAssetId",
    )
    .lean();

  if (!fieldVisit) {
    throw new ApiError(404, "Field visit photo evidence not found.");
  }

  // Check the employee/team/company access scope.
  const allowed = await canAccessCompanyAccess({
    requesterContext,
    companyId,
    targetCompanyAccessId: fieldVisit.companyAccessId,
  });

  if (!allowed) {
    throw new ApiError(
      403,
      "You are not allowed to view this field visit photograph.",
    );
  }

  const evidence = fieldVisit[evidenceField];

  if (
    evidence?.status !== "CAPTURED" ||
    !evidence.imagePublicId ||
    !evidence.imageAssetId
  ) {
    throw new ApiError(404, "Captured field visit photo not found.");
  }

  // Never deliver an image from another company's storage path.
  const expectedPrefix = `employee-management/attendance/photo-evidence/${companyId}/`;

  if (!evidence.imagePublicId.startsWith(expectedPrefix)) {
    throw new ApiError(404, "Field visit photo evidence not found.");
  }

  return {
    imagePublicId: evidence.imagePublicId,
    imageAssetId: evidence.imageAssetId,
    capturedAt: evidence.capturedAt,
    action,
    fieldVisitId,
  };
};
