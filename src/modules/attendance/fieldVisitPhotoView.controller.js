import { pipeline } from "node:stream/promises";

import { getAttendanceRequesterContext } from "./attendance.scope.js";
import { getAuthorizedFieldVisitPhotoEvidence } from "./fieldVisitPhotoView.service.js";
import { getAttendancePhotoStream } from "./attendancePhotoDelivery.service.js";

/**
 * GET /companies/:companyId/attendance/field-visits/:fieldVisitId/photo
 *
 * Requires authentication, company context,
 * attendance.photo_view permission and request validation.
 */
export const viewFieldVisitPhoto = async (req, res, next) => {
  try {
    const { companyId, fieldVisitId } = req.validated.params;
    const { action } = req.validated.query;

    const requesterContext = getAttendanceRequesterContext(req);

    // Authorize before retrieving the image from Cloudinary.
    const evidence = await getAuthorizedFieldVisitPhotoEvidence({
      companyId,
      fieldVisitId,
      action,
      requesterContext,
    });

    const { stream, contentType } = await getAttendancePhotoStream({
      imagePublicId: evidence.imagePublicId,
    });

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });

    await pipeline(stream, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    return next(error);
  }
};
