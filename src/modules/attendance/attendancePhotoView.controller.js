import { pipeline } from "node:stream/promises";

import { getAttendanceRequesterContext } from "./attendance.scope.js";
import { getAuthorizedAttendancePhotoEvidence } from "./attendancePhotoView.service.js";
import { getAttendancePhotoStream } from "./attendancePhotoDelivery.service.js";

/**
 * GET /companies/:companyId/attendance/:attendanceId/sessions/:sessionId/photo
 *
 * The route must enforce authentication, company context,
 * attendance.photo_view permission and request validation.
 */
export const viewAttendanceSessionPhoto = async (req, res, next) => {
  try {
    const { companyId, attendanceId, sessionId } = req.validated.params;
    const { action } = req.validated.query;

    const requesterContext = getAttendanceRequesterContext(req);

    // Verify attendance ownership and scope before accessing Cloudinary.
    const evidence = await getAuthorizedAttendancePhotoEvidence({
      companyId,
      attendanceId,
      sessionId,
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
