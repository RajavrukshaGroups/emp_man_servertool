import express from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  checkInSchema,
  checkOutSchema,
  startBreakSchema,
  endBreakSchema,
  getMyTodayAttendanceSchema,
  getMyAttendanceHistorySchema,
  listAttendanceSchema,
  getAttendanceSchema,
  createAttendancePolicySchema,
  listAttendancePoliciesSchema,
  getAttendancePolicySchema,
  updateAttendancePolicySchema,
  createShiftSchema,
  listShiftsSchema,
  getShiftSchema,
  updateShiftSchema,
  createAttendanceLocationSchema,
  listAttendanceLocationsSchema,
  getAttendanceLocationSchema,
  updateAttendanceLocationSchema,
  getDailyAttendanceSummarySchema,

  // FIELD VISIT
  startFieldVisitSchema,
  endFieldVisitSchema,
  cancelFieldVisitSchema,
  getMyActiveFieldVisitSchema,
  getMyFieldVisitHistorySchema,
  listFieldVisitsSchema,
  getFieldVisitSchema,

  // REGULARIZATION
  createRegularizationSchema,
  listRegularizationsSchema,
  getRegularizationSchema,
  recommendRegularizationSchema,
  approveRegularizationSchema,
  rejectRegularizationSchema,
  cancelRegularizationSchema,
} from "./attendance.validation.js";

import {
  checkIn,
  startBreak,
  endBreak,
  checkOut,
  getMyToday,
  getMyAttendanceHistory,
  listAttendance,
  getAttendance,
  getDailySummary,
} from "./attendance.controller.js";

import {
  createPolicy,
  listPolicies,
  getPolicy,
  updatePolicy,
} from "./attendancePolicy.controller.js";

import {
  createAttendanceShift,
  listAttendanceShifts,
  getAttendanceShift,
  updateAttendanceShift,
} from "./shift.controller.js";

import {
  createLocation,
  listLocations,
  getLocation,
  updateLocation,
} from "./attendanceLocation.controller.js";

import {
  startFieldVisit,
  endFieldVisit,
  cancelFieldVisit,
  getMyActiveFieldVisit,
  getMyFieldVisitHistory,
  listFieldVisits,
  getFieldVisit,
} from "./fieldVisit.controller.js";

import {
  createRegularization,
  getMyRegularizations,
  listRegularizations,
  getRegularizationById,
  recommendRegularization,
  approveRegularization,
  rejectRegularization,
  cancelRegularization,
} from "./attendanceRegularization.controller.js";

const router = express.Router({
  mergeParams: true,
});

/**
 * ============================================================
 * ATTENDANCE ROUTES
 * ============================================================
 *
 * Mounted at:
 *
 * /companies/:companyId/attendance
 */

router.use(authenticate, enforceCompanyContext);

/**
 * ============================================================
 * ATTENDANCE LOCATIONS
 * ============================================================
 */

router.post(
  "/locations",
  authorize(PERMISSIONS.ATTENDANCE_LOCATION_MANAGE),
  validate(createAttendanceLocationSchema),
  createLocation,
);

router.get(
  "/locations",
  authorize(PERMISSIONS.ATTENDANCE_LOCATION_READ),
  validate(listAttendanceLocationsSchema),
  listLocations,
);

router.get(
  "/locations/:locationId",
  authorize(PERMISSIONS.ATTENDANCE_LOCATION_READ),
  validate(getAttendanceLocationSchema),
  getLocation,
);

router.patch(
  "/locations/:locationId",
  authorize(PERMISSIONS.ATTENDANCE_LOCATION_MANAGE),
  validate(updateAttendanceLocationSchema),
  updateLocation,
);

/**
 * ============================================================
 * SHIFTS
 * ============================================================
 */

router.post(
  "/shifts",
  authorize(PERMISSIONS.ATTENDANCE_SHIFT_MANAGE),
  validate(createShiftSchema),
  createAttendanceShift,
);

router.get(
  "/shifts",
  authorize(PERMISSIONS.ATTENDANCE_SHIFT_READ),
  validate(listShiftsSchema),
  listAttendanceShifts,
);

router.get(
  "/shifts/:shiftId",
  authorize(PERMISSIONS.ATTENDANCE_SHIFT_READ),
  validate(getShiftSchema),
  getAttendanceShift,
);

router.patch(
  "/shifts/:shiftId",
  authorize(PERMISSIONS.ATTENDANCE_SHIFT_MANAGE),
  validate(updateShiftSchema),
  updateAttendanceShift,
);

/**
 * ============================================================
 * ATTENDANCE POLICY
 * ============================================================
 */

router.post(
  "/policies",
  authorize(PERMISSIONS.ATTENDANCE_POLICY_UPDATE),
  validate(createAttendancePolicySchema),
  createPolicy,
);

router.get(
  "/policies",
  authorize(PERMISSIONS.ATTENDANCE_POLICY_READ),
  validate(listAttendancePoliciesSchema),
  listPolicies,
);

router.get(
  "/policies/:policyId",
  authorize(PERMISSIONS.ATTENDANCE_POLICY_READ),
  validate(getAttendancePolicySchema),
  getPolicy,
);

router.patch(
  "/policies/:policyId",
  authorize(PERMISSIONS.ATTENDANCE_POLICY_UPDATE),
  validate(updateAttendancePolicySchema),
  updatePolicy,
);

/**
 * ============================================================
 * CHECK IN
 * ============================================================
 *
 * POST /companies/:companyId/attendance/check-in
 */

router.post(
  "/check-in",
  authorize(PERMISSIONS.ATTENDANCE_CHECK_IN),
  validate(checkInSchema),
  checkIn,
);

/**
 * ============================================================
 * START BREAK
 * ============================================================
 *
 * POST /companies/:companyId/attendance/break/start
 */

router.post(
  "/break/start",
  authorize(PERMISSIONS.ATTENDANCE_CHECK_IN),
  validate(startBreakSchema),
  startBreak,
);

/**
 * ============================================================
 * END BREAK / RESUME WORK
 * ============================================================
 *
 * POST /companies/:companyId/attendance/break/end
 */

router.post(
  "/break/end",
  authorize(PERMISSIONS.ATTENDANCE_CHECK_IN),
  validate(endBreakSchema),
  endBreak,
);

/**
 * ============================================================
 * CHECK OUT
 * ============================================================
 *
 * POST /companies/:companyId/attendance/check-out
 */

router.post(
  "/check-out",
  authorize(PERMISSIONS.ATTENDANCE_CHECK_OUT),
  validate(checkOutSchema),
  checkOut,
);

/**
 * ============================================================
 * MY TODAY ATTENDANCE
 * ============================================================
 *
 * GET /companies/:companyId/attendance/me/today
 */

router.get(
  "/me/today",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(getMyTodayAttendanceSchema),
  getMyToday,
);

/**
 * ============================================================
 * MY ATTENDANCE HISTORY
 * ============================================================
 *
 * GET /companies/:companyId/attendance/me/history
 */

router.get(
  "/me/history",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(getMyAttendanceHistorySchema),
  getMyAttendanceHistory,
);

/**
 * ============================================================
 * FIELD VISITS
 * ============================================================
 */

/**
 * START FIELD VISIT
 *
 * POST
 * /companies/:companyId/attendance/field-visits/start
 */
router.post(
  "/field-visits/start",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_CREATE),
  validate(startFieldVisitSchema),
  startFieldVisit,
);

/**
 * END FIELD VISIT
 *
 * POST
 * /companies/:companyId/attendance/field-visits/:fieldVisitId/end
 */
router.post(
  "/field-visits/:fieldVisitId/end",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_UPDATE),
  validate(endFieldVisitSchema),
  endFieldVisit,
);

/**
 * CANCEL FIELD VISIT
 *
 * POST
 * /companies/:companyId/attendance/field-visits/:fieldVisitId/cancel
 */
router.post(
  "/field-visits/:fieldVisitId/cancel",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_UPDATE),
  validate(cancelFieldVisitSchema),
  cancelFieldVisit,
);

/**
 * MY ACTIVE FIELD VISIT
 *
 * GET
 * /companies/:companyId/attendance/field-visits/me/active
 */
router.get(
  "/field-visits/me/active",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_READ),
  validate(getMyActiveFieldVisitSchema),
  getMyActiveFieldVisit,
);

/**
 * MY FIELD VISIT HISTORY
 *
 * GET
 * /companies/:companyId/attendance/field-visits/me/history
 */
router.get(
  "/field-visits/me/history",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_READ),
  validate(getMyFieldVisitHistorySchema),
  getMyFieldVisitHistory,
);

/**
 * LIST FIELD VISITS
 *
 * GET
 * /companies/:companyId/attendance/field-visits
 */
router.get(
  "/field-visits",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_READ),
  validate(listFieldVisitsSchema),
  listFieldVisits,
);

/**
 * GET FIELD VISIT BY ID
 *
 * GET
 * /companies/:companyId/attendance/field-visits/:fieldVisitId
 */
router.get(
  "/field-visits/:fieldVisitId",
  authorize(PERMISSIONS.ATTENDANCE_FIELD_VISIT_READ),
  validate(getFieldVisitSchema),
  getFieldVisit,
);

/**
 * ============================================================
 * ATTENDANCE REGULARIZATION
 * ============================================================
 */

/**
 * CREATE OWN REGULARIZATION REQUEST
 *
 * POST
 * /companies/:companyId/attendance/regularizations
 *
 * Employee identity comes from authentication.
 */
router.post(
  "/regularizations",
  authorize(PERMISSIONS.ATTENDANCE_CORRECTION_REQUEST),
  validate(createRegularizationSchema),
  createRegularization,
);

/**
 * MY REGULARIZATION HISTORY
 *
 * GET
 * /companies/:companyId/attendance/regularizations/me/history
 */
router.get(
  "/regularizations/me/history",
  authorize(PERMISSIONS.ATTENDANCE_CORRECTION_REQUEST),
  validate(listRegularizationsSchema),
  getMyRegularizations,
);

/**
 * LIST REGULARIZATION REQUESTS
 *
 * GET
 * /companies/:companyId/attendance/regularizations
 *
 * Scope:
 * COMPANY    -> company
 * DEPARTMENT -> department
 * TEAM       -> managed teams + self
 */
router.get(
  "/regularizations",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(listRegularizationsSchema),
  listRegularizations,
);

/**
 * RECOMMEND REGULARIZATION
 *
 * POST
 * /companies/:companyId/attendance/regularizations/:regularizationId/recommend
 *
 * Usually Team Lead / Manager.
 */
router.post(
  "/regularizations/:regularizationId/recommend",
  authorize(PERMISSIONS.ATTENDANCE_CORRECTION_RECOMMEND),
  validate(recommendRegularizationSchema),
  recommendRegularization,
);

/**
 * APPROVE REGULARIZATION
 *
 * POST
 * /companies/:companyId/attendance/regularizations/:regularizationId/approve
 *
 * Usually HR / Company Admin.
 *
 * Approval applies the correction and recalculates attendance.
 */
router.post(
  "/regularizations/:regularizationId/approve",
  authorize(PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE),
  validate(approveRegularizationSchema),
  approveRegularization,
);

/**
 * REJECT REGULARIZATION
 *
 * POST
 * /companies/:companyId/attendance/regularizations/:regularizationId/reject
 */
router.post(
  "/regularizations/:regularizationId/reject",
  authorize(PERMISSIONS.ATTENDANCE_CORRECTION_APPROVE),
  validate(rejectRegularizationSchema),
  rejectRegularization,
);

/**
 * CANCEL OWN REGULARIZATION
 *
 * POST
 * /companies/:companyId/attendance/regularizations/:regularizationId/cancel
 */
router.post(
  "/regularizations/:regularizationId/cancel",
  authorize(PERMISSIONS.ATTENDANCE_CORRECTION_REQUEST),
  validate(cancelRegularizationSchema),
  cancelRegularization,
);

/**
 * GET REGULARIZATION BY ID
 *
 * GET
 * /companies/:companyId/attendance/regularizations/:regularizationId
 *
 * IMPORTANT:
 * Keep this after all named regularization routes.
 */
router.get(
  "/regularizations/:regularizationId",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(getRegularizationSchema),
  getRegularizationById,
);

/**
 * ============================================================
 * DAILY ATTENDANCE SUMMARY
 * ============================================================
 *
 * GET
 * /companies/:companyId/attendance/daily-summary
 */

router.get(
  "/daily-summary",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(getDailyAttendanceSummarySchema),
  getDailySummary,
);

/**
 * ============================================================
 * LIST ATTENDANCE
 * ============================================================
 *
 * GET /companies/:companyId/attendance
 *
 * Scope is enforced in attendance.service + attendance.scope:
 *
 * COMPANY
 * -> company attendance
 *
 * DEPARTMENT
 * -> department attendance
 *
 * TEAM
 * -> managed teams + self
 *
 * Employee/self scope
 * -> self only
 */

router.get(
  "/",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(listAttendanceSchema),
  listAttendance,
);

/**
 * ============================================================
 * GET ATTENDANCE BY ID
 * ============================================================
 *
 * GET /companies/:companyId/attendance/:attendanceId
 *
 * IMPORTANT:
 * Keep this AFTER all named routes such as:
 *
 * /locations
 * /shifts
 * /policies
 * /check-in
 * /check-out
 * /me/today
 * /me/history
 */

router.get(
  "/:attendanceId",
  authorize(PERMISSIONS.ATTENDANCE_READ),
  validate(getAttendanceSchema),
  getAttendance,
);

export default router;
