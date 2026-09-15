import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Employee from "../employees/employee.model.js";

import Attendance from "./attendance.model.js";
import AttendanceLocation from "./attendanceLocation.model.js";
import AttendancePolicy from "./attendancePolicy.model.js";
import Shift from "./shift.model.js";
import FieldVisit from "./fieldVisit.model.js";

import {
  calculateAttendanceTotals,
  calculateBreakDurationMinutes,
  calculateTotalBreakMinutes,
  getActiveBreak,
  getAttendanceDateInTimezone,
  getOpenWorkSession,
  hasActiveBreak,
  hasOpenWorkSession,
  isLocationAccuracyAcceptable,
  isWithinGeofence,
  shouldEnforceGeofence,
  validateLocationCapturedAt,
} from "./attendance.utils.js";

import {
  buildAttendanceReadFilter,
  buildReadableCompanyAccessFilter,
  canAccessCompanyAccess,
  getSelfAttendanceIdentity,
} from "./attendance.scope.js";
/**
 * ============================================================
 * POPULATION
 * ============================================================
 */

const attendancePopulate = [
  {
    path: "employeeId",
    select: "userId companyAccessId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "companyAccessId",
    select:
      "userId employeeCode designation employmentType departmentId teamId roleId reportingManagerId attendanceMode shiftId attendanceLocationId attendanceLocationPolicy workLocationType workLocationName status",
    populate: [
      {
        path: "departmentId",
        select: "name code status",
      },
      {
        path: "teamId",
        select: "name code status",
      },
      {
        path: "roleId",
        select: "name code scopeType status",
      },
      {
        path: "shiftId",
        select:
          "name code startTime endTime isOvernight fullDayMinutes halfDayMinutes lateGraceMinutes earlyCheckoutGraceMinutes standardBreakMinutes maxBreakMinutes allowMultipleBreaks status",
      },
      {
        path: "attendanceLocationId",
        select:
          "name code locationType latitude longitude geofenceRadiusMeters allowCheckIn allowCheckOut status",
      },
    ],
  },
  {
    path: "shiftId",
    select:
      "name code startTime endTime isOvernight fullDayMinutes halfDayMinutes lateGraceMinutes earlyCheckoutGraceMinutes standardBreakMinutes maxBreakMinutes allowMultipleBreaks status",
  },
  {
    path: "attendancePolicyId",
    select:
      "name code locationRequired maximumAcceptedAccuracyMeters enforceGeofenceForOffice enforceGeofenceForHybrid enforceGeofenceForField enforceGeofenceForRemote allowMultipleWorkSessions allowReCheckInSameDay preventOverlappingSessions missingCheckoutAction autoCloseAfterMinutes maximumOpenSessionMinutes allowNextDayCheckInWithPendingPreviousDay regularizationEnabled status",
  },
  {
    path: "workSessions.checkInLocation.attendanceLocationId",
    select:
      "name code locationType latitude longitude geofenceRadiusMeters status",
  },
  {
    path: "workSessions.checkOutLocation.attendanceLocationId",
    select:
      "name code locationType latitude longitude geofenceRadiusMeters status",
  },
];

/**
 * ============================================================
 * GENERAL HELPERS
 * ============================================================
 */

const idsEqual = (first, second) => {
  if (!first || !second) {
    return false;
  }

  return String(first) === String(second);
};

const normalizeIpAddress = (ipAddress = "") =>
  String(ipAddress || "")
    .replace("::ffff:", "")
    .slice(0, 100);

const normalizeUserAgent = (userAgent = "") =>
  String(userAgent || "").slice(0, 1000);

const buildRequestMeta = (requestMeta = {}) => ({
  ipAddress: normalizeIpAddress(requestMeta.ipAddress || ""),
  userAgent: normalizeUserAgent(requestMeta.userAgent || ""),
});

/**
 * Avoid adding the same unresolved system anomaly repeatedly.
 */
const addAnomalyIfMissing = (attendance, type, description) => {
  const alreadyExists = attendance.anomalies?.some(
    (anomaly) => anomaly.type === type && anomaly.status === "OPEN",
  );

  if (alreadyExists) {
    return;
  }

  attendance.anomalies.push({
    type,
    status: "OPEN",
    description,
    detectedAt: new Date(),
  });
};

/**
 * Remove unresolved calculated anomalies before recalculating
 * them from the latest attendance state.
 */
const removeOpenCalculatedAnomalies = (attendance) => {
  const calculatedTypes = new Set([
    "LATE_ARRIVAL",
    "EARLY_CHECKOUT",
    "EXCESSIVE_BREAK",
    "OVERLAPPING_SESSION",
  ]);

  attendance.anomalies = attendance.anomalies.filter(
    (anomaly) =>
      !(calculatedTypes.has(anomaly.type) && anomaly.status === "OPEN"),
  );
};

/**
 * ============================================================
 * COMPANY
 * ============================================================
 */

const resolveAttendanceCompany = async (companyId, session = null) => {
  let query = Company.findOne({
    _id: companyId,
    isDeleted: false,
  }).select("_id name code status timezone");

  if (session) {
    query = query.session(session);
  }

  const company = await query.lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (company.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Attendance operations are not allowed for an inactive company.",
    );
  }

  return company;
};

/**
 * ============================================================
 * SELF ATTENDANCE CONTEXT
 * ============================================================
 */

const resolveSelfAttendanceContext = async ({
  companyId,
  requesterContext,
  session = null,
}) => {
  const identity = getSelfAttendanceIdentity({
    requesterContext,
    companyId,
  });

  let accessQuery = CompanyAccess.findOne({
    _id: identity.companyAccessId,
    companyId,
    isDeleted: false,
  }).select(
    "_id userId companyId employeeCode designation departmentId teamId roleId reportingManagerId attendanceMode shiftId attendanceLocationId attendanceLocationPolicy workLocationType workLocationName status",
  );

  if (session) {
    accessQuery = accessQuery.session(session);
  }

  const companyAccess = await accessQuery.lean();

  if (!companyAccess) {
    throw new ApiError(
      403,
      "Active company access is required for attendance.",
    );
  }

  if (companyAccess.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Attendance is available only for active employees.",
    );
  }

  let employeeQuery = Employee.findOne({
    companyId,
    companyAccessId: companyAccess._id,
    isDeleted: false,
  }).select("_id companyId companyAccessId userId status");

  if (session) {
    employeeQuery = employeeQuery.session(session);
  }

  const employee = await employeeQuery.lean();

  if (!employee) {
    throw new ApiError(
      404,
      "Employee profile was not found for this company access.",
    );
  }

  if (employee.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Attendance is available only for active employee profiles.",
    );
  }

  return {
    identity,
    companyAccess,
    employee,
  };
};

/**
 * ============================================================
 * SHIFT
 * ============================================================
 */

const resolveAssignedShift = async ({
  companyId,
  companyAccess,
  currentTime,
  session = null,
}) => {
  if (!companyAccess.shiftId) {
    throw new ApiError(
      409,
      "No attendance shift has been assigned to this employee. Please contact the administrator.",
    );
  }

  const filter = {
    _id: companyAccess.shiftId,
    companyId,
    status: "ACTIVE",
    isDeleted: false,
    $and: [
      {
        $or: [
          {
            effectiveFrom: null,
          },
          {
            effectiveFrom: {
              $lte: currentTime,
            },
          },
        ],
      },
      {
        $or: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              $gte: currentTime,
            },
          },
        ],
      },
    ],
  };

  let query = Shift.findOne(filter);

  if (session) {
    query = query.session(session);
  }

  const shift = await query.lean();

  if (!shift) {
    throw new ApiError(
      409,
      "The employee's assigned shift is inactive, expired, or unavailable.",
    );
  }

  return shift;
};

const createShiftSnapshot = (shift) => ({
  name: shift.name,
  code: shift.code,

  startTime: shift.startTime,
  endTime: shift.endTime,

  isOvernight: Boolean(shift.isOvernight),

  fullDayMinutes: shift.fullDayMinutes,

  halfDayMinutes: shift.halfDayMinutes,

  lateGraceMinutes: shift.lateGraceMinutes || 0,

  earlyCheckoutGraceMinutes: shift.earlyCheckoutGraceMinutes || 0,

  standardBreakMinutes: shift.standardBreakMinutes || 0,

  maxBreakMinutes: shift.maxBreakMinutes || 0,

  allowMultipleBreaks: shift.allowMultipleBreaks !== false,
});

/**
 * ============================================================
 * ATTENDANCE POLICY
 * ============================================================
 */

const resolveActiveAttendancePolicy = async ({
  companyId,
  currentTime,
  session = null,
}) => {
  const filter = {
    companyId,
    status: "ACTIVE",
    isDeleted: false,
    isDefault: true,

    effectiveFrom: {
      $lte: currentTime,
    },

    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: currentTime,
        },
      },
    ],
  };

  let query = AttendancePolicy.findOne(filter).sort({
    effectiveFrom: -1,
    createdAt: -1,
  });

  if (session) {
    query = query.session(session);
  }

  const policy = await query.lean();

  if (!policy) {
    throw new ApiError(
      409,
      "No active default attendance policy is configured for this company.",
    );
  }

  return policy;
};

/**
 * For checkout/break operations we use the policy attached to
 * the attendance record rather than resolving today's default
 * policy again.
 */
const resolveAttendancePolicyById = async ({
  companyId,
  policyId,
  session = null,
}) => {
  let query = AttendancePolicy.findOne({
    _id: policyId,
    companyId,
    isDeleted: false,
  });

  if (session) {
    query = query.session(session);
  }

  const policy = await query.lean();

  if (!policy) {
    throw new ApiError(
      409,
      "The attendance policy linked to this attendance record is unavailable.",
    );
  }

  return policy;
};

/**
 * ============================================================
 * ATTENDANCE LOCATION
 * ============================================================
 */

const isLocationEffective = (location, currentTime) => {
  if (
    location.effectiveFrom &&
    new Date(location.effectiveFrom) > currentTime
  ) {
    return false;
  }

  if (location.effectiveTo && new Date(location.effectiveTo) < currentTime) {
    return false;
  }

  return true;
};

const findSelectedAttendanceLocation = async ({
  companyId,
  attendanceLocationId,
  action,
  currentTime,
  session = null,
}) => {
  if (!attendanceLocationId) {
    return null;
  }

  const filter = {
    _id: attendanceLocationId,
    companyId,
    status: "ACTIVE",
    isDeleted: false,
  };

  if (action === "CHECK_IN") {
    filter.allowCheckIn = true;
  }

  if (action === "CHECK_OUT") {
    filter.allowCheckOut = true;
  }

  let query = AttendanceLocation.findOne(filter);

  if (session) {
    query = query.session(session);
  }

  const location = await query.lean();

  if (!location) {
    throw new ApiError(
      400,
      `The selected attendance location is unavailable for ${action === "CHECK_IN" ? "check-in" : "check-out"}.`,
    );
  }

  if (!isLocationEffective(location, currentTime)) {
    throw new ApiError(
      400,
      "The selected attendance location is not currently effective.",
    );
  }

  return location;
};

const findDefaultAttendanceLocation = async ({
  companyId,
  action,
  currentTime,
  session = null,
}) => {
  const filter = {
    companyId,
    status: "ACTIVE",
    isDeleted: false,
    isDefault: true,

    $and: [
      {
        $or: [
          {
            effectiveFrom: null,
          },
          {
            effectiveFrom: {
              $lte: currentTime,
            },
          },
        ],
      },
      {
        $or: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              $gte: currentTime,
            },
          },
        ],
      },
    ],
  };

  if (action === "CHECK_IN") {
    filter.allowCheckIn = true;
  }

  if (action === "CHECK_OUT") {
    filter.allowCheckOut = true;
  }

  let query = AttendanceLocation.findOne(filter).sort({
    createdAt: 1,
  });

  if (session) {
    query = query.session(session);
  }

  return query.lean();
};

const resolveAttendanceLocationPolicy = ({ companyAccess, action }) => {
  const configuredPolicy =
    action === "CHECK_IN"
      ? companyAccess?.attendanceLocationPolicy?.checkIn
      : companyAccess?.attendanceLocationPolicy?.checkOut;

  /**
   * Backward-compatible default.
   *
   * Old CompanyAccess records may not physically contain
   * attendanceLocationPolicy yet.
   */
  return configuredPolicy || "GEOFENCE_REQUIRED";
};

/**
 * ============================================================
 * GPS / GEOFENCE EVIDENCE
 * ============================================================
 *
 * Frontend supplies only:
 *
 * latitude
 * longitude
 * accuracy
 * capturedAt
 *
 * Backend decides:
 *
 * attendanceLocationId
 * distanceFromLocationMeters
 * withinGeofence
 */

const buildAttendanceLocationEvidence = async ({
  companyId,
  attendanceMode,
  policy,
  locationInput,
  attendanceLocationId = null,
  attendanceLocationPolicy = "GEOFENCE_REQUIRED",
  action,
  currentTime,
  requestMeta = {},
  session = null,
}) => {
  /**
   * Employee-specific attendance location rule.
   *
   * GEOFENCE_REQUIRED
   *   -> GPS mandatory
   *   -> assigned/default attendance location required
   *   -> radius must pass
   *
   * LOCATION_ONLY
   *   -> GPS mandatory
   *   -> location is recorded
   *   -> geofence radius is NOT enforced
   *
   * NOT_REQUIRED
   *   -> GPS/location evidence is optional
   */
  const geofenceRequired = attendanceLocationPolicy === "GEOFENCE_REQUIRED";

  const gpsRequired =
    attendanceLocationPolicy === "GEOFENCE_REQUIRED" ||
    attendanceLocationPolicy === "LOCATION_ONLY";
  if (!locationInput) {
    if (gpsRequired) {
      throw new ApiError(
        400,
        "Location permission and GPS coordinates are required for this attendance action.",
      );
    }

    return null;
  }

  /**
   * Accuracy is required when GPS/geofence is being enforced.
   */
  const accuracyAcceptable = isLocationAccuracyAcceptable(
    locationInput.accuracy,
    policy.maximumAcceptedAccuracyMeters,
  );

  if (gpsRequired && !accuracyAcceptable) {
    if (
      locationInput.accuracy === null ||
      locationInput.accuracy === undefined
    ) {
      throw new ApiError(400, "GPS accuracy information is required.");
    }

    throw new ApiError(
      400,
      `GPS accuracy is too low. Accuracy must be within ${policy.maximumAcceptedAccuracyMeters} meters.`,
    );
  }

  /**
   * The ID may be supplied either at body level or inside
   * location evidence.
   */
  const selectedLocationId =
    attendanceLocationId || locationInput.attendanceLocationId || null;

  let attendanceLocation = await findSelectedAttendanceLocation({
    companyId,
    attendanceLocationId: selectedLocationId,
    action,
    currentTime,
    session,
  });

  /**
   * OFFICE/HYBRID policy may require a geofence.
   *
   * If frontend did not explicitly select a known office,
   * try the company's default attendance location.
   */
  if (geofenceRequired && !attendanceLocation) {
    attendanceLocation = await findDefaultAttendanceLocation({
      companyId,
      action,
      currentTime,
      session,
    });
  }

  if (geofenceRequired && !attendanceLocation) {
    throw new ApiError(
      409,
      "No valid attendance location is configured for geofence verification.",
    );
  }

  let distanceFromLocationMeters = null;
  let withinGeofence = null;

  if (attendanceLocation) {
    const geofenceResult = isWithinGeofence({
      employeeLatitude: locationInput.latitude,

      employeeLongitude: locationInput.longitude,

      locationLatitude: attendanceLocation.latitude,

      locationLongitude: attendanceLocation.longitude,

      radiusMeters: attendanceLocation.geofenceRadiusMeters,
    });

    distanceFromLocationMeters = geofenceResult.distanceMeters;

    withinGeofence = geofenceResult.withinGeofence;
  }

  if (geofenceRequired && !withinGeofence) {
    throw new ApiError(
      403,
      `You are outside the permitted attendance geofence${
        attendanceLocation?.name ? ` for ${attendanceLocation.name}` : ""
      }.`,
    );
  }

  const capturedAtResult = validateLocationCapturedAt({
    capturedAt: locationInput.capturedAt,
    currentTime,
  });

  if (!capturedAtResult.valid) {
    if (capturedAtResult.reason === "INVALID") {
      throw new ApiError(400, "Invalid GPS capture timestamp.");
    }

    if (capturedAtResult.reason === "STALE") {
      throw new ApiError(
        400,
        "GPS location evidence is too old. Please refresh your location and try again.",
      );
    }

    if (capturedAtResult.reason === "FUTURE") {
      throw new ApiError(
        400,
        "GPS location evidence cannot be from the future. Please refresh your location and try again.",
      );
    }
  }

  const meta = buildRequestMeta(requestMeta);

  return {
    latitude: locationInput.latitude,
    longitude: locationInput.longitude,

    accuracy: locationInput.accuracy ?? null,

    capturedAt: capturedAtResult.capturedAt,

    attendanceLocationId: attendanceLocation?._id || null,

    distanceFromLocationMeters,

    withinGeofence,

    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  };
};

/**
 * ============================================================
 * OPEN ATTENDANCE
 * ============================================================
 *
 * We intentionally do NOT limit this by today's date.
 *
 * An overnight employee may check in:
 *
 * 2026-08-31 22:00
 *
 * and check out:
 *
 * 2026-09-01 06:00
 *
 * while the logical attendanceDate remains 2026-08-31.
 */

const findOpenAttendance = async ({
  companyId,
  companyAccessId,
  session = null,
}) => {
  let query = Attendance.findOne({
    companyId,
    companyAccessId,
    isDeleted: false,

    workSessions: {
      $elemMatch: {
        status: "OPEN",
        checkOutAt: null,
      },
    },
  }).sort({
    attendanceDate: -1,
    createdAt: -1,
  });

  if (session) {
    query = query.session(session);
  }

  return query;
};

/**
 * ============================================================
 * PREVIOUS MISSING CHECKOUT
 * ============================================================
 */

const validatePreviousOpenAttendance = async ({
  companyId,
  companyAccessId,
  attendanceDate,
  policy,
  session = null,
}) => {
  let query = Attendance.findOne({
    companyId,
    companyAccessId,
    attendanceDate: {
      $lt: attendanceDate,
    },
    isDeleted: false,

    workSessions: {
      $elemMatch: {
        status: "OPEN",
        checkOutAt: null,
      },
    },
  }).sort({
    attendanceDate: -1,
  });

  if (session) {
    query = query.session(session);
  }

  const previousAttendance = await query;

  if (!previousAttendance) {
    return null;
  }

  addAnomalyIfMissing(
    previousAttendance,
    "MISSING_CHECKOUT",
    "A previous attendance session is still open because checkout was not recorded.",
  );

  previousAttendance.calculationStatus = "RECALCULATION_REQUIRED";

  await previousAttendance.save({
    session,
  });

  if (!policy.allowNextDayCheckInWithPendingPreviousDay) {
    throw new ApiError(
      409,
      "A previous attendance session is still open. Please regularize or complete the previous attendance before checking in again.",
    );
  }

  return previousAttendance;
};

/**
 * ============================================================
 * ATTENDANCE RECALCULATION
 * ============================================================
 */

export const recalculateAttendance = async ({
  attendance,
  timezone,
  session = null,
}) => {
  if (!attendance) {
    throw new ApiError(404, "Attendance record not found.");
  }

  const result = calculateAttendanceTotals({
    workSessions: attendance.workSessions || [],

    breaks: attendance.breaks || [],

    shiftSnapshot: attendance.shiftSnapshot,

    attendanceDate: attendance.attendanceDate,

    timezone,
  });

  attendance.firstCheckInAt = result.firstCheckInAt;

  attendance.lastCheckOutAt = result.lastCheckOutAt;

  attendance.totalWorkedMinutes = result.totalWorkedMinutes;

  attendance.totalBreakMinutes = result.totalBreakMinutes;

  attendance.lateMinutes = result.lateMinutes;

  attendance.earlyCheckoutMinutes = result.earlyCheckoutMinutes;

  attendance.isLate = result.isLate;

  attendance.isEarlyCheckout = result.isEarlyCheckout;

  attendance.attendanceStatus = result.attendanceStatus;

  removeOpenCalculatedAnomalies(attendance);

  if (result.isLate) {
    addAnomalyIfMissing(
      attendance,
      "LATE_ARRIVAL",
      `Employee arrived ${result.lateMinutes} minute(s) beyond the configured grace period.`,
    );
  }

  if (result.isEarlyCheckout) {
    addAnomalyIfMissing(
      attendance,
      "EARLY_CHECKOUT",
      `Employee checked out ${result.earlyCheckoutMinutes} minute(s) before the permitted shift end.`,
    );
  }

  const maxBreakMinutes = Number(
    attendance.shiftSnapshot?.maxBreakMinutes || 0,
  );

  if (maxBreakMinutes > 0 && result.totalBreakMinutes > maxBreakMinutes) {
    addAnomalyIfMissing(
      attendance,
      "EXCESSIVE_BREAK",
      `Total break duration exceeded the allowed maximum by ${
        result.totalBreakMinutes - maxBreakMinutes
      } minute(s).`,
    );
  }

  /**
   * If another work session is currently open we cannot
   * consider the day completely calculated yet.
   */
  if (hasOpenWorkSession(attendance)) {
    attendance.calculationStatus = "PENDING";
  } else {
    attendance.calculationStatus = "CALCULATED";

    attendance.calculatedAt = new Date();
  }

  await attendance.save({
    session,
  });

  return attendance;
};

/**
 * ============================================================
 * ATTENDANCE LIST QUERY
 * ============================================================
 */

/**
 * ============================================================
 * ATTENDANCE LIST QUERY
 * ============================================================
 *
 * IMPORTANT SECURITY RULE:
 *
 * baseFilter represents the requester's authorized scope.
 *
 * User supplied filters must NEVER overwrite baseFilter.
 *
 * Therefore:
 *
 * scopeFilter AND requestFilters
 *
 * rather than merging both objects.
 */

const buildAttendanceListQuery = ({ baseFilter, query = {} }) => {
  const userFilter = {};

  if (query.employeeId) {
    userFilter.employeeId = query.employeeId;
  }

  if (query.companyAccessId) {
    userFilter.companyAccessId = query.companyAccessId;
  }

  if (query.shiftId) {
    userFilter.shiftId = query.shiftId;
  }

  if (query.attendanceMode) {
    userFilter.attendanceMode = query.attendanceMode;
  }

  if (query.attendanceStatus) {
    userFilter.attendanceStatus = query.attendanceStatus;
  }

  if (query.calculationStatus) {
    userFilter.calculationStatus = query.calculationStatus;
  }

  if (query.payrollStatus) {
    userFilter.payrollStatus = query.payrollStatus;
  }

  if (query.isLate !== undefined) {
    userFilter.isLate = query.isLate;
  }

  if (query.isEarlyCheckout !== undefined) {
    userFilter.isEarlyCheckout = query.isEarlyCheckout;
  }

  /**
   * Exact date takes precedence over range.
   */
  if (query.date) {
    userFilter.attendanceDate = query.date;
  } else if (query.fromDate || query.toDate) {
    userFilter.attendanceDate = {};

    if (query.fromDate) {
      userFilter.attendanceDate.$gte = query.fromDate;
    }

    if (query.toDate) {
      userFilter.attendanceDate.$lte = query.toDate;
    }
  }

  /**
   * SECURITY:
   *
   * Never allow user supplied filters to overwrite the
   * authorization scope.
   *
   * MongoDB evaluates:
   *
   * authorized scope
   *       AND
   * requested filters
   */
  if (Object.keys(userFilter).length === 0) {
    return baseFilter;
  }

  return {
    $and: [baseFilter, userFilter],
  };
};

/**
 * ============================================================
 * DAILY ATTENDANCE SUMMARY
 * ============================================================
 *
 * Returns every ACTIVE employee visible to the requester,
 * including employees who do not yet have an Attendance
 * document for the requested date.
 *
 * IMPORTANT:
 *
 * Missing Attendance != ABSENT automatically.
 *
 * During the day, the employee is represented as:
 *
 * NOT_CHECKED_IN
 *
 * Leave / holiday / weekly-off integration can override this
 * later.
 */

export const getDailyAttendanceSummary = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  await resolveAttendanceCompany(companyId);

  const { date, departmentId, teamId, shiftId, attendanceStatus, search } =
    query;

  /**
   * ========================================================
   * AUTHORIZED COMPANY ACCESS SCOPE
   * ========================================================
   */

  const scopeFilter = await buildReadableCompanyAccessFilter({
    requesterContext,
    companyId,
  });

  /**
   * Additional filters must never replace scope.
   */
  const accessUserFilter = {
    status: "ACTIVE",
  };

  if (departmentId) {
    accessUserFilter.departmentId = departmentId;
  }

  if (teamId) {
    accessUserFilter.teamId = teamId;
  }

  if (shiftId) {
    accessUserFilter.shiftId = shiftId;
  }

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    accessUserFilter.$or = [
      {
        employeeCode: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        designation: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
    ];
  }

  const accessFilter = {
    $and: [scopeFilter, accessUserFilter],
  };

  /**
   * ========================================================
   * RESOLVE VISIBLE COMPANY ACCESS RECORDS
   * ========================================================
   *
   * Do NOT paginate here yet, because we first need to remove
   * company users who do not have Employee profiles.
   */

  const companyAccesses = await CompanyAccess.find(accessFilter)
    .select(
      "_id userId employeeCode designation employmentType departmentId teamId roleId reportingManagerId attendanceMode shiftId attendanceLocationId attendanceLocationPolicy workLocationType workLocationName status",
    )
    .populate([
      {
        path: "userId",
        select:
          "firstName middleName lastName displayName email mobile profilePhoto status",
      },
      {
        path: "departmentId",
        select: "name code status",
      },
      {
        path: "teamId",
        select: "name code status",
      },
      {
        path: "roleId",
        select: "name code scopeType status",
      },
      {
        path: "shiftId",
        select:
          "name code startTime endTime isOvernight fullDayMinutes halfDayMinutes lateGraceMinutes earlyCheckoutGraceMinutes standardBreakMinutes maxBreakMinutes allowMultipleBreaks status",
      },
      {
        path: "attendanceLocationId",
        select:
          "name code locationType latitude longitude geofenceRadiusMeters allowCheckIn allowCheckOut status",
      },
    ])
    .lean();

  const companyAccessIds = companyAccesses.map((access) => access._id);

  /**
   * ========================================================
   * ONLY REAL EMPLOYEE PROFILES
   * ========================================================
   *
   * This prevents Company Administrator accounts without an
   * Employee profile from appearing in the attendance sheet.
   */

  const employees = await Employee.find({
    companyId,

    companyAccessId: {
      $in: companyAccessIds,
    },

    status: "ACTIVE",

    isDeleted: false,
  })
    .select("_id companyId companyAccessId userId status")
    .lean();

  const employeeByAccessId = new Map(
    employees.map((employee) => [String(employee.companyAccessId), employee]),
  );

  let employeeAccesses = companyAccesses.filter((access) =>
    employeeByAccessId.has(String(access._id)),
  );

  /**
   * ========================================================
   * ATTENDANCE FOR REQUESTED DATE
   * ========================================================
   */

  const attendanceRecords = await Attendance.find({
    companyId,

    companyAccessId: {
      $in: employeeAccesses.map((access) => access._id),
    },

    attendanceDate: date,

    isDeleted: false,
  })
    .populate(attendancePopulate)
    .lean();

  const attendanceByAccessId = new Map(
    attendanceRecords.map((attendance) => [
      String(attendance.companyAccessId?._id || attendance.companyAccessId),
      attendance,
    ]),
  );

  /**
   * ========================================================
   * BUILD DAILY SHEET ROWS
   * ========================================================
   */

  let rows = employeeAccesses.map((access) => {
    const employee = employeeByAccessId.get(String(access._id));

    const attendance = attendanceByAccessId.get(String(access._id)) || null;

    const employeeUser = access.userId || null;

    return {
      companyAccessId: access._id,

      employeeId: employee?._id || null,

      employeeCode: access.employeeCode || "",

      employeeName:
        employeeUser?.displayName ||
        [
          employeeUser?.firstName,
          employeeUser?.middleName,
          employeeUser?.lastName,
        ]
          .filter(Boolean)
          .join(" ") ||
        "Employee",

      designation: access.designation || "",

      departmentId: access.departmentId || null,

      teamId: access.teamId || null,

      shiftId: access.shiftId || null,

      attendanceMode: access.attendanceMode || "OFFICE",

      attendanceLocationId: access.attendanceLocationId || null,

      attendanceDate: date,

      attendanceId: attendance?._id || null,

      attendanceStatus: attendance?.attendanceStatus || "NOT_CHECKED_IN",

      attendance,
    };
  });

  /**
   * ========================================================
   * STATUS FILTER
   * ========================================================
   *
   * This is applied after merging employees + attendance
   * because NOT_CHECKED_IN is not stored in Attendance.
   */

  if (attendanceStatus) {
    rows = rows.filter((row) => row.attendanceStatus === attendanceStatus);
  }

  /**
   * ========================================================
   * PAGINATION
   * ========================================================
   */

  const page = Number(query.page || 1);

  const limit = Number(query.limit || 20);

  const total = rows.length;

  const totalPages = Math.ceil(total / limit);

  const start = (page - 1) * limit;

  const items = rows.slice(start, start + limit);

  return {
    date,

    items,

    summary: {
      totalEmployees: rows.length,

      notCheckedIn: rows.filter(
        (row) => row.attendanceStatus === "NOT_CHECKED_IN",
      ).length,

      pending: rows.filter((row) => row.attendanceStatus === "PENDING").length,

      present: rows.filter((row) => row.attendanceStatus === "PRESENT").length,

      halfDay: rows.filter((row) => row.attendanceStatus === "HALF_DAY").length,

      absent: rows.filter((row) => row.attendanceStatus === "ABSENT").length,
    },

    pagination: {
      page,

      limit,

      total,

      totalPages,

      hasNextPage: page * limit < total,

      hasPreviousPage: page > 1,
    },
  };
};

/**
 * ============================================================
 * LIST ATTENDANCE
 * ============================================================
 */

export const listAttendances = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  await resolveAttendanceCompany(companyId);

  /**
   * ========================================================
   * AUTHORIZATION SCOPE
   * ========================================================
   *
   * COMPANY
   * -> entire company
   *
   * DEPARTMENT
   * -> permitted department
   *
   * TEAM
   * -> managed teams + self
   *
   * fallback/self
   * -> self only
   */
  const scopeFilter = await buildAttendanceReadFilter({
    requesterContext,
    companyId,
  });

  /**
   * ========================================================
   * COMPANY ACCESS FILTERS
   * ========================================================
   *
   * departmentId, teamId and employee search are properties
   * of CompanyAccess rather than Attendance.
   *
   * Resolve those records first and then use their IDs as an
   * additional Attendance filter.
   *
   * IMPORTANT:
   * This filter is ADDITIONAL to scopeFilter.
   * It never replaces authorization scope.
   */
  let companyAccessFilter = null;

  if (query.departmentId || query.teamId || query.search) {
    const accessFilter = {
      companyId,
      isDeleted: false,
    };

    if (query.departmentId) {
      accessFilter.departmentId = query.departmentId;
    }

    if (query.teamId) {
      accessFilter.teamId = query.teamId;
    }

    if (query.search) {
      const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      accessFilter.$or = [
        {
          employeeCode: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
        {
          designation: {
            $regex: escapedSearch,
            $options: "i",
          },
        },
      ];
    }

    const matchingAccesses = await CompanyAccess.find(accessFilter)
      .select("_id")
      .lean();

    companyAccessFilter = {
      companyAccessId: {
        $in: matchingAccesses.map((item) => item._id),
      },
    };
  }

  /**
   * ========================================================
   * USER SUPPLIED ATTENDANCE FILTERS
   * ========================================================
   *
   * buildAttendanceListQuery already guarantees:
   *
   * scopeFilter AND userFilter
   */
  const attendanceFilter = buildAttendanceListQuery({
    baseFilter: scopeFilter,
    query,
  });

  /**
   * Add CompanyAccess-based filtering as another AND
   * condition rather than mutating authorization scope.
   */
  const filter = companyAccessFilter
    ? {
        $and: [attendanceFilter, companyAccessFilter],
      }
    : attendanceFilter;

  const page = Number(query.page || 1);

  const limit = Number(query.limit || 20);

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Attendance.find(filter)
      .sort({
        attendanceDate: -1,
        firstCheckInAt: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .populate(attendancePopulate),

    Attendance.countDocuments(filter),
  ]);

  return {
    items,

    pagination: {
      page,
      limit,
      total,

      totalPages: Math.ceil(total / limit),

      hasNextPage: page * limit < total,

      hasPreviousPage: page > 1,
    },
  };
};

/**
 * ============================================================
 * GET ATTENDANCE BY ID
 * ============================================================
 */

export const getAttendanceById = async ({
  companyId,
  attendanceId,
  requesterContext,
}) => {
  await resolveAttendanceCompany(companyId);

  const attendance = await Attendance.findOne({
    _id: attendanceId,
    companyId,
    isDeleted: false,
  });

  if (!attendance) {
    throw new ApiError(404, "Attendance record not found.");
  }

  const allowed = await canAccessCompanyAccess({
    requesterContext,

    companyId,

    targetCompanyAccessId: attendance.companyAccessId,
  });

  if (!allowed) {
    throw new ApiError(
      403,
      "You are not allowed to access this attendance record.",
    );
  }

  await attendance.populate(attendancePopulate);

  return attendance;
};

/**
 * ============================================================
 * MY ATTENDANCE HISTORY
 * ============================================================
 */

export const getMyAttendanceHistory = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  await resolveAttendanceCompany(companyId);

  const identity = getSelfAttendanceIdentity({
    requesterContext,
    companyId,
  });

  const filter = buildAttendanceListQuery({
    baseFilter: {
      companyId,

      companyAccessId: identity.companyAccessId,

      isDeleted: false,
    },

    query,
  });

  const page = Number(query.page || 1);

  const limit = Number(query.limit || 20);

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Attendance.find(filter)
      .sort({
        attendanceDate: -1,
        firstCheckInAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .populate(attendancePopulate),

    Attendance.countDocuments(filter),
  ]);

  return {
    items,

    pagination: {
      page,

      limit,

      total,

      totalPages: Math.ceil(total / limit),

      hasNextPage: page * limit < total,

      hasPreviousPage: page > 1,
    },
  };
};

/**
 * ============================================================
 * CHECK IN
 * ============================================================
 */

export const checkInAttendance = async ({
  companyId,
  data,
  requesterContext,
  requestMeta = {},
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const currentTime = new Date();

      const company = await resolveAttendanceCompany(companyId, session);

      const { companyAccess, employee } = await resolveSelfAttendanceContext({
        companyId,
        requesterContext,
        session,
      });

      const timezone = company.timezone || "Asia/Kolkata";

      const attendanceDate = getAttendanceDateInTimezone(currentTime, timezone);

      const policy = await resolveActiveAttendancePolicy({
        companyId,
        currentTime,
        session,
      });

      const shift = await resolveAssignedShift({
        companyId,
        companyAccess,
        currentTime,
        session,
      });

      /**
       * Check for an older forgotten/open attendance.
       */
      await validatePreviousOpenAttendance({
        companyId,
        companyAccessId: companyAccess._id,
        attendanceDate,
        policy,
        session,
      });

      /**
       * Current open attendance always blocks another
       * simultaneous work session.
       */
      const openAttendance = await findOpenAttendance({
        companyId,
        companyAccessId: companyAccess._id,
        session,
      });

      if (openAttendance) {
        throw new ApiError(
          409,
          "You already have an active attendance session.",
        );
      }

      const attendanceMode = companyAccess.attendanceMode || "OFFICE";

      const attendanceLocationPolicy = resolveAttendanceLocationPolicy({
        companyAccess,
        action: "CHECK_IN",
      });

      /**
       * An assigned attendance location is mandatory only when
       * this employee must pass geofence verification.
       */
      if (
        attendanceLocationPolicy === "GEOFENCE_REQUIRED" &&
        !companyAccess.attendanceLocationId
      ) {
        throw new ApiError(
          409,
          "No attendance location has been assigned to this employee. Please contact the administrator.",
        );
      }

      const locationEvidence = await buildAttendanceLocationEvidence({
        companyId,

        attendanceMode,

        policy,

        locationInput: data.location || null,

        attendanceLocationId: companyAccess.attendanceLocationId || null,

        attendanceLocationPolicy,

        action: "CHECK_IN",

        currentTime,

        requestMeta,

        session,
      });

      let attendance = await Attendance.findOne({
        companyId,

        companyAccessId: companyAccess._id,

        attendanceDate,

        isDeleted: false,
      }).session(session);

      /**
       * ====================================================
       * FIRST CHECK-IN OF THE DAY
       * ====================================================
       */
      if (!attendance) {
        const createdRecords = await Attendance.create(
          [
            {
              companyId,

              companyAccessId: companyAccess._id,

              employeeId: employee._id,

              attendanceDate,

              shiftId: shift._id,

              attendancePolicyId: policy._id,

              shiftSnapshot: createShiftSnapshot(shift),

              attendanceMode: companyAccess.attendanceMode || "OFFICE",

              workSessions: [
                {
                  checkInAt: currentTime,

                  checkOutAt: null,

                  checkInLocation: locationEvidence,

                  checkOutLocation: null,

                  checkInSource: "EMPLOYEE",

                  checkOutSource: null,

                  workedMinutes: 0,

                  status: "OPEN",
                },
              ],

              breaks: [],

              firstCheckInAt: currentTime,

              lastCheckOutAt: null,

              totalWorkedMinutes: 0,

              totalBreakMinutes: 0,

              lateMinutes: 0,

              earlyCheckoutMinutes: 0,

              isLate: false,

              isEarlyCheckout: false,

              attendanceStatus: "PENDING",

              calculationStatus: "PENDING",

              payrollStatus: "NOT_PROCESSED",

              notes: data.notes || "",

              createdBy: requesterContext.userId || null,

              updatedBy: requesterContext.userId || null,
            },
          ],
          {
            session,
          },
        );

        attendance = createdRecords[0];
      } else {
        /**
         * ==================================================
         * RE-CHECK-IN / MULTIPLE SESSION
         * ==================================================
         */

        if (attendance.payrollStatus === "FINALIZED") {
          throw new ApiError(
            409,
            "Attendance cannot be modified because payroll has already been finalized.",
          );
        }

        if (!policy.allowReCheckInSameDay) {
          throw new ApiError(
            409,
            "Re-check-in on the same day is not allowed by the attendance policy.",
          );
        }

        if (
          !policy.allowMultipleWorkSessions &&
          attendance.workSessions.length > 0
        ) {
          throw new ApiError(
            409,
            "Multiple attendance sessions are not allowed by the attendance policy.",
          );
        }

        if (hasOpenWorkSession(attendance)) {
          throw new ApiError(409, "An attendance session is already open.");
        }

        if (hasActiveBreak(attendance)) {
          throw new ApiError(
            409,
            "An active break must be completed before starting another work session.",
          );
        }

        attendance.workSessions.push({
          checkInAt: currentTime,
          checkOutAt: null,

          checkInLocation: locationEvidence,

          checkOutLocation: null,

          checkInSource: "EMPLOYEE",

          workedMinutes: 0,

          status: "OPEN",
        });

        attendance.calculationStatus = "PENDING";

        attendance.attendanceStatus = "PENDING";

        attendance.updatedBy = requesterContext.userId || null;

        if (data.notes && !attendance.notes) {
          attendance.notes = data.notes;
        }

        await attendance.save({
          session,
        });
      }

      result = attendance;
    });

    await result.populate(attendancePopulate);

    return result;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        409,
        "Attendance has already been created for this employee and date.",
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * START BREAK
 * ============================================================
 */

export const startAttendanceBreak = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      await resolveAttendanceCompany(companyId, session);

      const { companyAccess } = await resolveSelfAttendanceContext({
        companyId,
        requesterContext,
        session,
      });

      const attendance = await findOpenAttendance({
        companyId,
        companyAccessId: companyAccess._id,
        session,
      });

      if (!attendance) {
        throw new ApiError(409, "You must check in before starting a break.");
      }

      if (attendance.payrollStatus === "FINALIZED") {
        throw new ApiError(
          409,
          "Attendance cannot be changed because payroll has been finalized.",
        );
      }

      if (hasActiveBreak(attendance)) {
        throw new ApiError(409, "You already have an active break.");
      }

      /**
       * ==================================================
       * ACTIVE FIELD VISIT CHECK
       * ==================================================
       *
       * A break cannot be started while the employee
       * has an active field visit.
       */
      const activeFieldVisit = await FieldVisit.findOne({
        companyId,
        companyAccessId: companyAccess._id,
        attendanceId: attendance._id,
        status: "IN_PROGRESS",
        isDeleted: false,
      })
        .select("_id visitType siteName startedAt")
        .session(session);

      if (activeFieldVisit) {
        throw new ApiError(
          409,
          "You have an active field visit. Please end or cancel the field visit before starting a break.",
        );
      }

      const shiftAllowsMultipleBreaks =
        attendance.shiftSnapshot?.allowMultipleBreaks !== false;

      if (!shiftAllowsMultipleBreaks && attendance.breaks.length > 0) {
        throw new ApiError(
          409,
          "Multiple breaks are not allowed for this shift.",
        );
      }

      attendance.breaks.push({
        startedAt: new Date(),
        endedAt: null,

        durationMinutes: 0,

        type: data.type || "OTHER",
        notes: data.notes ?? "",

        status: "ACTIVE",
      });

      attendance.calculationStatus = "PENDING";

      attendance.updatedBy = requesterContext.userId || null;

      await attendance.save({
        session,
      });

      result = attendance;
    });

    await result.populate(attendancePopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * END BREAK / RESUME WORK
 * ============================================================
 */

export const endAttendanceBreak = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      await resolveAttendanceCompany(companyId, session);

      const { companyAccess } = await resolveSelfAttendanceContext({
        companyId,
        requesterContext,
        session,
      });

      const attendance = await findOpenAttendance({
        companyId,
        companyAccessId: companyAccess._id,
        session,
      });

      if (!attendance) {
        throw new ApiError(409, "No active work session was found.");
      }

      const activeBreak = getActiveBreak(attendance);

      if (!activeBreak) {
        throw new ApiError(409, "There is no active break to end.");
      }

      const currentTime = new Date();

      activeBreak.endedAt = currentTime;

      activeBreak.durationMinutes = calculateBreakDurationMinutes(activeBreak);

      activeBreak.endNotes = data.notes ?? "";

      activeBreak.status = "COMPLETED";

      attendance.totalBreakMinutes = calculateTotalBreakMinutes(
        attendance.breaks,
      );

      const maxBreakMinutes = Number(
        attendance.shiftSnapshot?.maxBreakMinutes || 0,
      );

      if (
        maxBreakMinutes > 0 &&
        attendance.totalBreakMinutes > maxBreakMinutes
      ) {
        addAnomalyIfMissing(
          attendance,
          "EXCESSIVE_BREAK",
          `Total break duration has exceeded the permitted maximum of ${maxBreakMinutes} minute(s).`,
        );
      }

      attendance.calculationStatus = "PENDING";

      attendance.updatedBy = requesterContext.userId || null;

      await attendance.save({
        session,
      });

      result = attendance;
    });

    await result.populate(attendancePopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * CHECK OUT
 * ============================================================
 */

export const checkOutAttendance = async ({
  companyId,
  data,
  requesterContext,
  requestMeta = {},
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const currentTime = new Date();

      const company = await resolveAttendanceCompany(companyId, session);

      const { companyAccess } = await resolveSelfAttendanceContext({
        companyId,
        requesterContext,
        session,
      });

      const attendance = await findOpenAttendance({
        companyId,
        companyAccessId: companyAccess._id,
        session,
      });

      if (!attendance) {
        throw new ApiError(
          409,
          "No active attendance session was found to check out.",
        );
      }

      if (attendance.payrollStatus === "FINALIZED") {
        throw new ApiError(
          409,
          "Attendance cannot be changed because payroll has already been finalized.",
        );
      }

      const openSession = getOpenWorkSession(attendance);

      if (!openSession) {
        throw new ApiError(409, "No active work session was found.");
      }

      /**
       * ==================================================
       * ACTIVE FIELD VISIT CHECK
       * ==================================================
       */

      const activeFieldVisit = await FieldVisit.findOne({
        companyId,
        companyAccessId: companyAccess._id,
        attendanceId: attendance._id,
        status: "IN_PROGRESS",
        isDeleted: false,
      })
        .select("_id visitType siteName startedAt")
        .session(session);

      if (activeFieldVisit) {
        throw new ApiError(
          409,
          "You have an active field visit. Please end or cancel the field visit before checking out.",
        );
      }
      const policy = await resolveAttendancePolicyById({
        companyId,
        policyId: attendance.attendancePolicyId,
        session,
      });

      const attendanceMode =
        companyAccess.attendanceMode || attendance.attendanceMode || "OFFICE";

      const attendanceLocationPolicy = resolveAttendanceLocationPolicy({
        companyAccess,
        action: "CHECK_OUT",
      });

      if (
        attendanceLocationPolicy === "GEOFENCE_REQUIRED" &&
        !companyAccess.attendanceLocationId
      ) {
        throw new ApiError(
          409,
          "No attendance location has been assigned to this employee. Please contact the administrator.",
        );
      }
      const locationEvidence = await buildAttendanceLocationEvidence({
        companyId,

        attendanceMode,

        policy,

        locationInput: data.location || null,

        attendanceLocationId: companyAccess.attendanceLocationId || null,

        attendanceLocationPolicy,

        action: "CHECK_OUT",

        currentTime,

        requestMeta,

        session,
      });

      const activeBreak = getActiveBreak(attendance);

      if (activeBreak) {
        activeBreak.endedAt = currentTime;
        activeBreak.durationMinutes =
          calculateBreakDurationMinutes(activeBreak);
        activeBreak.status = "COMPLETED";
      }

      openSession.checkOutAt = currentTime;
      openSession.checkOutLocation = locationEvidence;
      openSession.checkOutSource = "EMPLOYEE";

      openSession.workedMinutes = Math.max(
        0,
        Math.floor(
          (currentTime.getTime() - new Date(openSession.checkInAt).getTime()) /
            (60 * 1000),
        ),
      );

      openSession.status = "CLOSED";

      attendance.updatedBy = requesterContext.userId || null;

      await recalculateAttendance({
        attendance,
        timezone: company.timezone || "Asia/Kolkata",
        session,
      });

      result = attendance;
    });

    await result.populate(attendancePopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * GET MY TODAY ATTENDANCE
 * ============================================================
 */

export const getMyTodayAttendance = async ({ companyId, requesterContext }) => {
  const company = await resolveAttendanceCompany(companyId);

  const { companyAccess } = await resolveSelfAttendanceContext({
    companyId,
    requesterContext,
  });

  const attendanceDate = getAttendanceDateInTimezone(
    new Date(),
    company.timezone || "Asia/Kolkata",
  );

  const attendance = await Attendance.findOne({
    companyId,

    companyAccessId: companyAccess._id,

    attendanceDate,

    isDeleted: false,
  }).populate(attendancePopulate);

  /**
   * No attendance created for today yet.
   */
  if (!attendance) {
    return {
      attendanceDate,

      attendance: null,

      state: {
        checkedIn: false,

        onBreak: false,

        onFieldVisit: false,

        canCheckIn: true,

        canStartBreak: false,

        canEndBreak: false,

        canStartFieldVisit: false,

        canCheckOut: false,

        activeFieldVisit: null,
      },
    };
  }

  const openSession = getOpenWorkSession(attendance);

  const activeBreak = getActiveBreak(attendance);

  /**
   * Check whether an active field visit exists for
   * the current attendance record.
   *
   * Checkout is not allowed while a field visit
   * remains IN_PROGRESS.
   */
  const activeFieldVisit = await FieldVisit.findOne({
    companyId,

    companyAccessId: companyAccess._id,

    attendanceId: attendance._id,

    status: "IN_PROGRESS",

    isDeleted: false,
  })
    .select("_id visitType siteName purpose startedAt")
    .lean();

  return {
    attendanceDate,

    attendance,

    state: {
      checkedIn: Boolean(openSession),

      onBreak: Boolean(activeBreak),

      onFieldVisit: Boolean(activeFieldVisit),

      canCheckIn: !openSession && !activeBreak && !activeFieldVisit,

      canStartBreak: Boolean(openSession) && !activeBreak && !activeFieldVisit,

      canEndBreak: Boolean(activeBreak),

      canStartFieldVisit:
        Boolean(openSession) && !activeBreak && !activeFieldVisit,

      canCheckOut: Boolean(openSession) && !activeFieldVisit,

      activeFieldVisit: activeFieldVisit || null,
    },
  };
};
