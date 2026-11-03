import { ApiError } from "../../utils/ApiError.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

import { createAttendancePhotoEvidence, getAttendancePhotoRequirement } from "./attendancePhotoEvidence.service.js";

/**
 * ============================================================
 * UPLOAD ATTENDANCE PHOTO EVIDENCE
 * ============================================================
 *
 * POST /companies/:companyId/attendance/photo-evidence
 *
 * Authentication, company context, authorization,
 * upload processing and validation must be enforced
 * by the route before this controller executes.
 */
export const uploadAttendancePhotoEvidence = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const {
      action,
      attendanceId = null,
      fieldVisitId = null,
    } = req.validated.body;

    const requesterContext = getAttendanceRequesterContext(req);

    if (!req.file?.buffer) {
      throw new ApiError(400, "Attendance photograph is required.");
    }

    const evidence = await createAttendancePhotoEvidence({
      companyId,
      requesterContext,
      action,
      attendanceId,
      fieldVisitId,
      imageBuffer: req.file.buffer,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Attendance photo evidence uploaded successfully.",
      data: evidence,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET ATTENDANCE PHOTO REQUIREMENT
 * ============================================================
 *
 * GET /companies/:companyId/attendance/photo-requirement
 */
export const getAttendancePhotoRequirementController = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;
    const {
      action,
      attendanceId = null,
      fieldVisitId = null,
    } = req.validated.query;

    const requesterContext = getAttendanceRequesterContext(req);

    const requirement = await getAttendancePhotoRequirement({
      companyId,
      requesterContext,
      action,
      attendanceId,
      fieldVisitId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance photo requirement retrieved successfully.",
      data: requirement,
    });
  } catch (error) {
    return next(error);
  }
};
