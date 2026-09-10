import {
  checkInAttendance,
  checkOutAttendance,
  endAttendanceBreak,
  getAttendanceById,
  getDailyAttendanceSummary,
  getMyAttendanceHistory as getMyAttendanceHistoryService,
  getMyTodayAttendance,
  listAttendances,
  startAttendanceBreak,
} from "./attendance.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

/**
 * ============================================================
 * REQUEST META
 * ============================================================
 *
 * IP address and user agent are supplemental attendance
 * evidence only.
 *
 * GPS remains the primary location evidence.
 */
const getRequestMeta = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];

  let ipAddress = "";

  if (Array.isArray(forwardedFor)) {
    ipAddress = forwardedFor[0] || "";
  } else if (typeof forwardedFor === "string") {
    ipAddress = forwardedFor.split(",")[0]?.trim() || "";
  } else {
    ipAddress = req.ip || req.socket?.remoteAddress || "";
  }

  return {
    ipAddress,

    userAgent: req.get("user-agent") || "",
  };
};

/**
 * ============================================================
 * CHECK IN
 * ============================================================
 *
 * POST /companies/:companyId/attendance/check-in
 */
export const checkIn = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const attendance = await checkInAttendance({
      companyId,

      data: req.validated.body,

      requesterContext,

      requestMeta: getRequestMeta(req),
    });

    return res.status(201).json({
      success: true,

      statusCode: 201,

      message: "Attendance check-in recorded successfully.",

      data: attendance,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * START BREAK
 * ============================================================
 *
 * POST /companies/:companyId/attendance/break/start
 */
export const startBreak = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const attendance = await startAttendanceBreak({
      companyId,

      data: req.validated.body,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Attendance break started successfully.",

      data: attendance,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * END BREAK / RESUME WORK
 * ============================================================
 *
 * POST /companies/:companyId/attendance/break/end
 */
export const endBreak = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const attendance = await endAttendanceBreak({
      companyId,

      data: req.validated.body,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Attendance break ended successfully.",

      data: attendance,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CHECK OUT
 * ============================================================
 *
 * POST /companies/:companyId/attendance/check-out
 */
export const checkOut = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const attendance = await checkOutAttendance({
      companyId,

      data: req.validated.body,

      requesterContext,

      requestMeta: getRequestMeta(req),
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Attendance check-out recorded successfully.",

      data: attendance,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * MY TODAY ATTENDANCE
 * ============================================================
 *
 * GET /companies/:companyId/attendance/me/today
 */
export const getMyToday = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const result = await getMyTodayAttendance({
      companyId,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Today's attendance fetched successfully.",

      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * MY ATTENDANCE HISTORY
 * ============================================================
 *
 * GET /companies/:companyId/attendance/me/history
 */
export const getMyAttendanceHistory = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const data = await getMyAttendanceHistoryService({
      companyId,

      query: req.validated.query,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Attendance history fetched successfully.",

      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST ATTENDANCE
 * ============================================================
 *
 * GET /companies/:companyId/attendance
 */
export const listAttendance = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const data = await listAttendances({
      companyId,

      query: req.validated.query,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Attendance records fetched successfully.",

      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET ATTENDANCE BY ID
 * ============================================================
 *
 * GET /companies/:companyId/attendance/:attendanceId
 */
export const getAttendance = async (req, res, next) => {
  try {
    const { companyId, attendanceId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const data = await getAttendanceById({
      companyId,

      attendanceId,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Attendance record fetched successfully.",

      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * DAILY ATTENDANCE SUMMARY
 * ============================================================
 *
 * GET
 * /companies/:companyId/attendance/daily-summary
 */

export const getDailySummary = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const data = await getDailyAttendanceSummary({
      companyId,

      query: req.validated.query,

      requesterContext,
    });

    return res.status(200).json({
      success: true,

      statusCode: 200,

      message: "Daily attendance summary fetched successfully.",

      data,
    });
  } catch (error) {
    return next(error);
  }
};
