import express from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createWorkCalendarSchema,
  updateWorkCalendarSchema,
  listWorkCalendarsSchema,
  getWorkCalendarSchema,
  createWorkCalendarDaySchema,
  updateWorkCalendarDaySchema,
  listWorkCalendarDaysSchema,
  getWorkCalendarDaySchema,
  resolveWorkCalendarDateSchema,
  getWorkCalendarRangeSchema,
} from "./workCalendar.validation.js";

import {
  createCalendar,
  listCalendars,
  getCalendar,
  updateCalendar,
  createCalendarDay,
  listCalendarDays,
  getCalendarDay,
  updateCalendarDay,
  resolveCalendarDate,
  getCalendarRange,
} from "./workCalendar.controller.js";

const router = express.Router({
  mergeParams: true,
});

/**
 * ============================================================
 * WORK CALENDAR ROUTES
 * ============================================================
 *
 * Mounted at:
 *
 * /companies/:companyId/work-calendars
 */

router.use(authenticate, enforceCompanyContext);

/**
 * ============================================================
 * RESOLVE SINGLE DATE
 * ============================================================
 *
 * GET
 * /companies/:companyId/work-calendars/resolve?date=2026-10-11
 *
 * IMPORTANT:
 * Keep named routes such as /resolve and /range BEFORE
 * /:calendarId.
 */

router.get(
  "/resolve",
  authorize(PERMISSIONS.CALENDAR_READ),
  validate(resolveWorkCalendarDateSchema),
  resolveCalendarDate,
);

/**
 * ============================================================
 * RESOLVE DATE RANGE
 * ============================================================
 *
 * GET
 * /companies/:companyId/work-calendars/range
 * ?fromDate=2026-10-01&toDate=2026-10-31
 */

router.get(
  "/range",
  authorize(PERMISSIONS.CALENDAR_READ),
  validate(getWorkCalendarRangeSchema),
  getCalendarRange,
);

/**
 * ============================================================
 * CREATE WORK CALENDAR
 * ============================================================
 */

router.post(
  "/",
  authorize(PERMISSIONS.CALENDAR_MANAGE),
  validate(createWorkCalendarSchema),
  createCalendar,
);

/**
 * ============================================================
 * LIST WORK CALENDARS
 * ============================================================
 */

router.get(
  "/",
  authorize(PERMISSIONS.CALENDAR_READ),
  validate(listWorkCalendarsSchema),
  listCalendars,
);

/**
 * ============================================================
 * CREATE CALENDAR DAY
 * ============================================================
 *
 * POST
 * /companies/:companyId/work-calendars/:calendarId/days
 */

router.post(
  "/:calendarId/days",
  authorize(PERMISSIONS.CALENDAR_MANAGE),
  validate(createWorkCalendarDaySchema),
  createCalendarDay,
);

/**
 * ============================================================
 * LIST CALENDAR DAYS
 * ============================================================
 */

router.get(
  "/:calendarId/days",
  authorize(PERMISSIONS.CALENDAR_READ),
  validate(listWorkCalendarDaysSchema),
  listCalendarDays,
);

/**
 * ============================================================
 * GET CALENDAR DAY
 * ============================================================
 */

router.get(
  "/:calendarId/days/:calendarDayId",
  authorize(PERMISSIONS.CALENDAR_READ),
  validate(getWorkCalendarDaySchema),
  getCalendarDay,
);

/**
 * ============================================================
 * UPDATE CALENDAR DAY
 * ============================================================
 */

router.patch(
  "/:calendarId/days/:calendarDayId",
  authorize(PERMISSIONS.CALENDAR_MANAGE),
  validate(updateWorkCalendarDaySchema),
  updateCalendarDay,
);

/**
 * ============================================================
 * GET WORK CALENDAR
 * ============================================================
 *
 * IMPORTANT:
 * Keep this after /resolve and /range.
 */

router.get(
  "/:calendarId",
  authorize(PERMISSIONS.CALENDAR_READ),
  validate(getWorkCalendarSchema),
  getCalendar,
);

/**
 * ============================================================
 * UPDATE WORK CALENDAR
 * ============================================================
 */

router.patch(
  "/:calendarId",
  authorize(PERMISSIONS.CALENDAR_MANAGE),
  validate(updateWorkCalendarSchema),
  updateCalendar,
);

export default router;
