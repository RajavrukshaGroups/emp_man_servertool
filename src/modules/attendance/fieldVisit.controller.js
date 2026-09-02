import {
  startFieldVisit as startFieldVisitService,
  endFieldVisit as endFieldVisitService,
  cancelFieldVisit as cancelFieldVisitService,
  getMyActiveFieldVisit as getMyActiveFieldVisitService,
  getMyFieldVisitHistory as getMyFieldVisitHistoryService,
  listFieldVisits as listFieldVisitsService,
  getFieldVisitById as getFieldVisitByIdService,
} from "./fieldVisit.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

/**
 * ============================================================
 * REQUEST META
 * ============================================================
 *
 * Supplemental request evidence.
 *
 * GPS itself comes from the validated request body.
 * IP / User-Agent are captured server-side.
 */
const getRequestMeta = (req) => ({
  ipAddress:
    req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",

  userAgent: req.get("user-agent") || "",
});

/**
 * ============================================================
 * START FIELD VISIT
 * ============================================================
 *
 * POST
 * /companies/:companyId/attendance/field-visits/start
 */
export const startFieldVisit = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const data = req.validated.body;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await startFieldVisitService({
      companyId,
      data,
      requesterContext,
      requestMeta: getRequestMeta(req),
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Field visit started successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * END FIELD VISIT
 * ============================================================
 *
 * POST
 * /companies/:companyId/attendance/field-visits/:fieldVisitId/end
 */
export const endFieldVisit = async (req, res, next) => {
  try {
    const { companyId, fieldVisitId } = req.validated.params;

    const data = req.validated.body;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await endFieldVisitService({
      companyId,
      fieldVisitId,
      data,
      requesterContext,
      requestMeta: getRequestMeta(req),
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Field visit ended successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CANCEL FIELD VISIT
 * ============================================================
 *
 * POST
 * /companies/:companyId/attendance/field-visits/:fieldVisitId/cancel
 */
export const cancelFieldVisit = async (req, res, next) => {
  try {
    const { companyId, fieldVisitId } = req.validated.params;

    const data = req.validated.body;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await cancelFieldVisitService({
      companyId,
      fieldVisitId,
      data,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Field visit cancelled successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * MY ACTIVE FIELD VISIT
 * ============================================================
 *
 * GET
 * /companies/:companyId/attendance/field-visits/me/active
 */
export const getMyActiveFieldVisit = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await getMyActiveFieldVisitService({
      companyId,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: result
        ? "Active field visit fetched successfully."
        : "No active field visit found.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * MY FIELD VISIT HISTORY
 * ============================================================
 *
 * GET
 * /companies/:companyId/attendance/field-visits/me/history
 */
export const getMyFieldVisitHistory = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const query = req.validated.query;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await getMyFieldVisitHistoryService({
      companyId,
      query,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Field visit history fetched successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST FIELD VISITS
 * ============================================================
 *
 * GET
 * /companies/:companyId/attendance/field-visits
 *
 * Scope rules are enforced by the service.
 */
export const listFieldVisits = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const query = req.validated.query;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await listFieldVisitsService({
      companyId,
      query,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Field visits fetched successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET FIELD VISIT
 * ============================================================
 *
 * GET
 * /companies/:companyId/attendance/field-visits/:fieldVisitId
 */
export const getFieldVisit = async (req, res, next) => {
  try {
    const { companyId, fieldVisitId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await getFieldVisitByIdService({
      companyId,
      fieldVisitId,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Field visit fetched successfully.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};
