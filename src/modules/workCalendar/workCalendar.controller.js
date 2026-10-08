import {
  createWorkCalendar,
  listWorkCalendars,
  getWorkCalendarById,
  updateWorkCalendar,
  createWorkCalendarDay,
  listWorkCalendarDays,
  getWorkCalendarDayById,
  updateWorkCalendarDay,
  resolveWorkDay,
  resolveWorkCalendarRange,
} from "./workCalendar.service.js";

import { getAttendanceRequesterContext } from "../attendance/attendance.scope.js";

/**
 * ============================================================
 * CREATE WORK CALENDAR
 * ============================================================
 */

export const createCalendar = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const calendar = await createWorkCalendar({
      companyId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Work calendar created successfully.",
      data: calendar,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST WORK CALENDARS
 * ============================================================
 */

export const listCalendars = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const data = await listWorkCalendars({
      companyId,
      query: req.validated.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendars fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET WORK CALENDAR
 * ============================================================
 */

export const getCalendar = async (req, res, next) => {
  try {
    const { companyId, calendarId } = req.validated.params;

    const calendar = await getWorkCalendarById({
      companyId,
      calendarId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar fetched successfully.",
      data: calendar,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE WORK CALENDAR
 * ============================================================
 */

export const updateCalendar = async (req, res, next) => {
  try {
    const { companyId, calendarId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const calendar = await updateWorkCalendar({
      companyId,
      calendarId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar updated successfully.",
      data: calendar,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CREATE WORK CALENDAR DAY
 * ============================================================
 */

export const createCalendarDay = async (req, res, next) => {
  try {
    const { companyId, calendarId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const calendarDay = await createWorkCalendarDay({
      companyId,
      calendarId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Work calendar day created successfully.",
      data: calendarDay,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST WORK CALENDAR DAYS
 * ============================================================
 */

export const listCalendarDays = async (req, res, next) => {
  try {
    const { companyId, calendarId } = req.validated.params;

    const data = await listWorkCalendarDays({
      companyId,
      calendarId,
      query: req.validated.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar days fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET WORK CALENDAR DAY
 * ============================================================
 */

export const getCalendarDay = async (req, res, next) => {
  try {
    const { companyId, calendarId, calendarDayId } = req.validated.params;

    const calendarDay = await getWorkCalendarDayById({
      companyId,
      calendarId,
      calendarDayId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar day fetched successfully.",
      data: calendarDay,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE WORK CALENDAR DAY
 * ============================================================
 */

export const updateCalendarDay = async (req, res, next) => {
  try {
    const { companyId, calendarId, calendarDayId } = req.validated.params;

    const requesterContext = getAttendanceRequesterContext(req);

    const calendarDay = await updateWorkCalendarDay({
      companyId,
      calendarId,
      calendarDayId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar day updated successfully.",
      data: calendarDay,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * RESOLVE WORK DAY
 * ============================================================
 *
 * Example:
 *
 * GET
 * /companies/:companyId/work-calendars/resolve?date=2026-10-11
 *
 * This endpoint is also useful for testing the same resolver
 * that Leave and Attendance will consume internally.
 */

export const resolveCalendarDate = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;
    const { date } = req.validated.query;

    const data = await resolveWorkDay({
      companyId,
      date,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar date resolved successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * RESOLVE WORK CALENDAR RANGE
 * ============================================================
 *
 * Example:
 *
 * GET
 * /companies/:companyId/work-calendars/range
 * ?fromDate=2026-10-01&toDate=2026-10-31
 */

export const getCalendarRange = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;
    const { fromDate, toDate } = req.validated.query;

    const data = await resolveWorkCalendarRange({
      companyId,
      fromDate,
      toDate,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Work calendar range resolved successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
