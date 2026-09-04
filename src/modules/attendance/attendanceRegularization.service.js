import mongoose from "mongoose";

import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Employee from "../employees/employee.model.js";

import Attendance from "./attendance.model.js";
import AttendancePolicy from "./attendancePolicy.model.js";
import AttendanceRegularization from "./attendanceRegularization.model.js";

import { recalculateAttendance } from "./attendance.service.js";

import {
  buildRegularizationReadFilter,
  canAccessCompanyAccess,
  canManageCompanyAccess,
  getSelfAttendanceIdentity,
} from "./attendance.scope.js";

/**
 * ============================================================
 * POPULATION
 * ============================================================
 */

const regularizationPopulate = [
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
      "userId employeeCode designation employmentType departmentId teamId roleId reportingManagerId attendanceMode shiftId status",
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
    ],
  },
  {
    path: "attendanceId",
    select:
      "attendanceDate shiftId attendancePolicyId attendanceMode firstCheckInAt lastCheckOutAt totalWorkedMinutes totalBreakMinutes attendanceStatus calculationStatus payrollStatus payrollPeriod",
  },
  {
    path: "recommendedBy",
    select: "firstName middleName lastName displayName email",
  },
  {
    path: "approvedBy",
    select: "firstName middleName lastName displayName email",
  },
  {
    path: "rejectedBy",
    select: "firstName middleName lastName displayName email",
  },
  {
    path: "cancelledBy",
    select: "firstName middleName lastName displayName email",
  },
  {
    path: "appliedBy",
    select: "firstName middleName lastName displayName email",
  },
  {
    path: "createdBy",
    select: "firstName middleName lastName displayName email",
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

const normalizeText = (value = "") => String(value || "").trim();

const calculateMinutes = (start, end) => {
  if (!start || !end) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (new Date(end).getTime() - new Date(start).getTime()) / (60 * 1000),
    ),
  );
};

const resolveCompany = async ({ companyId, session = null }) => {
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
      "Attendance regularization is not available for an inactive company.",
    );
  }

  return company;
};

/**
 * ============================================================
 * SELF REGULARIZATION CONTEXT
 * ============================================================
 */

const resolveSelfRegularizationContext = async ({
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
    "_id userId companyId employeeCode designation departmentId teamId roleId reportingManagerId attendanceMode shiftId status",
  );

  if (session) {
    accessQuery = accessQuery.session(session);
  }

  const companyAccess = await accessQuery.lean();

  if (!companyAccess || companyAccess.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Active company access is required for attendance regularization.",
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
      "Attendance regularization is available only for active employees.",
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
 * POLICY
 * ============================================================
 */

const resolveAttendancePolicy = async ({
  companyId,
  attendance,
  session = null,
}) => {
  if (!attendance?.attendancePolicyId) {
    throw new ApiError(
      409,
      "Attendance policy is not linked to this attendance record.",
    );
  }

  let query = AttendancePolicy.findOne({
    _id: attendance.attendancePolicyId,
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

  if (!policy.regularizationEnabled) {
    throw new ApiError(
      403,
      "Attendance regularization is disabled by the attendance policy.",
    );
  }

  return policy;
};

/**
 * ============================================================
 * TARGET HELPERS
 * ============================================================
 */

const getTargetWorkSession = (attendance, targetWorkSessionId) => {
  if (!targetWorkSessionId) {
    return null;
  }

  return attendance.workSessions?.id(targetWorkSessionId) || null;
};

const getTargetBreak = (attendance, targetBreakId) => {
  if (!targetBreakId) {
    return null;
  }

  return attendance.breaks?.id(targetBreakId) || null;
};

const requireTargetWorkSession = (attendance, targetWorkSessionId) => {
  const workSession = getTargetWorkSession(attendance, targetWorkSessionId);

  if (!workSession) {
    throw new ApiError(
      400,
      "The selected work session does not exist in this attendance record.",
    );
  }

  return workSession;
};

const requireTargetBreak = (attendance, targetBreakId) => {
  const attendanceBreak = getTargetBreak(attendance, targetBreakId);

  if (!attendanceBreak) {
    throw new ApiError(
      400,
      "The selected break does not exist in this attendance record.",
    );
  }

  return attendanceBreak;
};

/**
 * ============================================================
 * POLICY PERMISSION FOR REQUEST TYPE
 * ============================================================
 */

const validateRegularizationTypeAgainstPolicy = ({ requestType, policy }) => {
  if (
    ["MISSING_CHECK_IN", "CHECK_IN_TIME_CORRECTION"].includes(requestType) &&
    policy.allowCheckInCorrection === false
  ) {
    throw new ApiError(
      403,
      "Check-in correction is disabled by the attendance policy.",
    );
  }

  if (
    ["MISSING_CHECKOUT", "CHECKOUT_TIME_CORRECTION"].includes(requestType) &&
    policy.allowCheckOutCorrection === false
  ) {
    throw new ApiError(
      403,
      "Checkout correction is disabled by the attendance policy.",
    );
  }

  if (
    ["BREAK_CORRECTION", "BREAK_EXTENSION"].includes(requestType) &&
    policy.allowBreakCorrection === false
  ) {
    throw new ApiError(
      403,
      "Break correction is disabled by the attendance policy.",
    );
  }
};

/**
 * ============================================================
 * REGULARIZATION WINDOW
 * ============================================================
 */

const validateRegularizationWindow = ({ attendanceDate, policy, timezone }) => {
  const windowDays = Number(policy.regularizationWindowDays ?? 0);

  /**
   * 0 means only the current attendance date.
   *
   * We calculate using YYYY-MM-DD dates so that timezone
   * differences do not accidentally shift the window.
   */
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  const today = `${year}-${month}-${day}`;

  const todayUtc = Date.parse(`${today}T00:00:00.000Z`);
  const attendanceUtc = Date.parse(`${attendanceDate}T00:00:00.000Z`);

  if (Number.isNaN(attendanceUtc)) {
    throw new ApiError(400, "Invalid attendance date.");
  }

  const differenceDays = Math.floor(
    (todayUtc - attendanceUtc) / (24 * 60 * 60 * 1000),
  );

  if (differenceDays < 0) {
    throw new ApiError(
      400,
      "Attendance regularization cannot be requested for a future date.",
    );
  }

  if (differenceDays > windowDays) {
    throw new ApiError(
      400,
      `Attendance regularization can be requested only within ${windowDays} day(s) of the attendance date.`,
    );
  }
};

/**
 * ============================================================
 * ORIGINAL VALUE SNAPSHOT
 * ============================================================
 */

const buildOriginalValueSnapshot = ({
  requestType,
  attendance,
  targetWorkSessionId,
  targetBreakId,
}) => {
  const snapshot = {
    originalCheckInAt: null,
    originalCheckOutAt: null,
    originalBreakStartAt: null,
    originalBreakEndAt: null,
    originalBreakDurationMinutes: null,
  };

  if (
    [
      "MISSING_CHECKOUT",
      "CHECK_IN_TIME_CORRECTION",
      "CHECKOUT_TIME_CORRECTION",
    ].includes(requestType)
  ) {
    const workSession = requireTargetWorkSession(
      attendance,
      targetWorkSessionId,
    );

    snapshot.originalCheckInAt = workSession.checkInAt || null;
    snapshot.originalCheckOutAt = workSession.checkOutAt || null;
  }

  if (["BREAK_CORRECTION", "BREAK_EXTENSION"].includes(requestType)) {
    const attendanceBreak = requireTargetBreak(attendance, targetBreakId);

    snapshot.originalBreakStartAt = attendanceBreak.startedAt || null;
    snapshot.originalBreakEndAt = attendanceBreak.endedAt || null;
    snapshot.originalBreakDurationMinutes =
      attendanceBreak.durationMinutes ?? null;
  }

  return snapshot;
};

/**
 * ============================================================
 * REQUEST BUSINESS VALIDATION
 * ============================================================
 */

const validateRequestedValuesAgainstAttendance = ({ data, attendance }) => {
  /**
   * ========================================================
   * MISSING CHECK-IN
   * ========================================================
   *
   * A missing check-in must point to an actual work session
   * whose check-in is genuinely missing.
   *
   * Never use MISSING_CHECK_IN to overwrite an existing
   * check-in. That is CHECK_IN_TIME_CORRECTION.
   */
  if (data.requestType === "MISSING_CHECK_IN") {
    /**
     * A genuine missing check-in means no work session was
     * recorded for that work period.
     *
     * Therefore the employee provides both boundaries and the
     * approved regularization creates a historical session.
     */
    if (!data.requestedCheckInAt || !data.requestedCheckOutAt) {
      throw new ApiError(
        400,
        "Requested check-in and checkout times are required for missing check-in regularization.",
      );
    }

    const requestedCheckInAt = new Date(data.requestedCheckInAt);
    const requestedCheckOutAt = new Date(data.requestedCheckOutAt);

    if (requestedCheckOutAt <= requestedCheckInAt) {
      throw new ApiError(
        400,
        "Requested checkout time must be later than requested check-in time.",
      );
    }

    /**
     * MISSING_CHECK_IN creates a new session.
     * It must never target an existing session.
     */
    if (data.targetWorkSessionId) {
      throw new ApiError(
        400,
        "targetWorkSessionId must not be provided for missing check-in regularization.",
      );
    }
  }
  if (
    [
      "MISSING_CHECKOUT",
      "CHECK_IN_TIME_CORRECTION",
      "CHECKOUT_TIME_CORRECTION",
    ].includes(data.requestType)
  ) {
    const workSession = requireTargetWorkSession(
      attendance,
      data.targetWorkSessionId,
    );

    if (data.requestType === "MISSING_CHECKOUT" && workSession.checkOutAt) {
      throw new ApiError(
        409,
        "The selected work session already contains a checkout time.",
      );
    }

    if (
      data.requestType === "CHECK_IN_TIME_CORRECTION" &&
      !workSession.checkInAt
    ) {
      throw new ApiError(
        409,
        "The selected work session does not contain a check-in time to correct.",
      );
    }

    if (
      data.requestType === "CHECKOUT_TIME_CORRECTION" &&
      !workSession.checkOutAt
    ) {
      throw new ApiError(
        409,
        "The selected work session does not contain a checkout time to correct. Use missing checkout regularization instead.",
      );
    }

    const requestedCheckInAt = data.requestedCheckInAt
      ? new Date(data.requestedCheckInAt)
      : null;

    const requestedCheckOutAt = data.requestedCheckOutAt
      ? new Date(data.requestedCheckOutAt)
      : null;

    if (
      requestedCheckInAt &&
      workSession.checkOutAt &&
      requestedCheckInAt >= new Date(workSession.checkOutAt)
    ) {
      throw new ApiError(
        400,
        "Requested check-in time must be earlier than the session checkout time.",
      );
    }

    if (
      requestedCheckOutAt &&
      workSession.checkInAt &&
      requestedCheckOutAt <= new Date(workSession.checkInAt)
    ) {
      throw new ApiError(
        400,
        "Requested checkout time must be later than the session check-in time.",
      );
    }
  }

  if (data.requestType === "BREAK_CORRECTION") {
    const attendanceBreak = requireTargetBreak(attendance, data.targetBreakId);

    const start = new Date(data.requestedBreakStartAt);
    const end = new Date(data.requestedBreakEndAt);

    if (end <= start) {
      throw new ApiError(
        400,
        "Requested break end time must be later than the requested break start time.",
      );
    }

    /**
     * A completed break is the safest target for correction.
     * We do not silently rewrite an active break.
     */
    if (attendanceBreak.status === "ACTIVE") {
      throw new ApiError(
        409,
        "An active break cannot be regularized until it has ended.",
      );
    }
  }

  if (data.requestType === "BREAK_EXTENSION") {
    const attendanceBreak = requireTargetBreak(attendance, data.targetBreakId);

    if (attendanceBreak.status === "ACTIVE" || !attendanceBreak.endedAt) {
      throw new ApiError(
        409,
        "Break extension can be requested only for a completed break.",
      );
    }
  }
};

/**
 * ============================================================
 * DUPLICATE ACTIVE REQUEST CHECK
 * ============================================================
 */

const ensureNoDuplicateActiveRegularization = async ({
  companyId,
  companyAccessId,
  attendanceId,
  requestType,
  targetWorkSessionId,
  targetBreakId,
  session = null,
}) => {
  const filter = {
    companyId,
    companyAccessId,
    attendanceId,
    requestType,
    status: {
      $in: ["PENDING", "RECOMMENDED"],
    },
    isDeleted: false,
  };

  if (targetWorkSessionId) {
    filter.targetWorkSessionId = targetWorkSessionId;
  }

  if (targetBreakId) {
    filter.targetBreakId = targetBreakId;
  }

  let query = AttendanceRegularization.exists(filter);

  if (session) {
    query = query.session(session);
  }

  if (await query) {
    throw new ApiError(
      409,
      "An active regularization request already exists for this attendance event.",
    );
  }
};

/**
 * ============================================================
 * CREATE REGULARIZATION
 * ============================================================
 */

export const createAttendanceRegularization = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const company = await resolveCompany({
        companyId,
        session,
      });

      const { companyAccess, employee } =
        await resolveSelfRegularizationContext({
          companyId,
          requesterContext,
          session,
        });

      /**
       * V1 regularization requires an existing attendance
       * record.
       *
       * A completely absent day can later be handled through
       * an attendance creation regularization workflow.
       */
      if (!data.attendanceId) {
        throw new ApiError(
          400,
          "attendanceId is required for attendance regularization.",
        );
      }

      const attendance = await Attendance.findOne({
        _id: data.attendanceId,
        companyId,
        companyAccessId: companyAccess._id,
        employeeId: employee._id,
        isDeleted: false,
      }).session(session);

      if (!attendance) {
        throw new ApiError(
          404,
          "Attendance record was not found for this employee.",
        );
      }

      const policy = await resolveAttendancePolicy({
        companyId,
        attendance,
        session,
      });

      validateRegularizationTypeAgainstPolicy({
        requestType: data.requestType,
        policy,
      });

      validateRegularizationWindow({
        attendanceDate: attendance.attendanceDate,
        policy,
        timezone: company.timezone || "Asia/Kolkata",
      });

      validateRequestedValuesAgainstAttendance({
        data,
        attendance,
      });

      /**
       * MISSING_CHECK_IN still requires an existing Attendance
       * document in V1, but it does not target an existing work
       * session.
       *
       * On approval, a new historical work session is created
       * from requestedCheckInAt and requestedCheckOutAt.
       */
      const originalSnapshot = buildOriginalValueSnapshot({
        requestType: data.requestType,
        attendance,
        targetWorkSessionId: data.targetWorkSessionId || null,
        targetBreakId: data.targetBreakId || null,
      });

      await ensureNoDuplicateActiveRegularization({
        companyId,
        companyAccessId: companyAccess._id,
        attendanceId: attendance._id,
        requestType: data.requestType,
        targetWorkSessionId: data.targetWorkSessionId || null,
        targetBreakId: data.targetBreakId || null,
        session,
      });

      const createdRecords = await AttendanceRegularization.create(
        [
          {
            companyId,

            attendanceId: attendance._id,

            companyAccessId: companyAccess._id,

            employeeId: employee._id,

            attendanceDate: attendance.attendanceDate,

            requestType: data.requestType,

            targetWorkSessionId: data.targetWorkSessionId || null,

            targetBreakId: data.targetBreakId || null,

            requestedCheckInAt: data.requestedCheckInAt
              ? new Date(data.requestedCheckInAt)
              : null,

            requestedCheckOutAt: data.requestedCheckOutAt
              ? new Date(data.requestedCheckOutAt)
              : null,

            requestedBreakStartAt: data.requestedBreakStartAt
              ? new Date(data.requestedBreakStartAt)
              : null,

            requestedBreakEndAt: data.requestedBreakEndAt
              ? new Date(data.requestedBreakEndAt)
              : null,

            requestedBreakExtensionMinutes:
              data.requestedBreakExtensionMinutes ?? null,

            locationEvidence: data.locationEvidence
              ? {
                  latitude: data.locationEvidence.latitude,
                  longitude: data.locationEvidence.longitude,
                  accuracy: data.locationEvidence.accuracy ?? null,
                  capturedAt: data.locationEvidence.capturedAt
                    ? new Date(data.locationEvidence.capturedAt)
                    : null,
                }
              : null,

            ...originalSnapshot,

            reason: normalizeText(data.reason),

            attachmentUrl: normalizeText(data.attachmentUrl),

            status: "PENDING",

            applicationStatus: "NOT_APPLIED",

            affectsFinalizedPayroll: false,

            payrollAdjustmentRequired: false,

            createdBy: requesterContext.userId || null,

            updatedBy: requesterContext.userId || null,
          },
        ],
        {
          session,
        },
      );

      result = createdRecords[0];
    });

    await result.populate(regularizationPopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * MY REGULARIZATIONS
 * ============================================================
 */

export const getMyAttendanceRegularizations = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  await resolveCompany({
    companyId,
  });

  const identity = getSelfAttendanceIdentity({
    requesterContext,
    companyId,
  });

  const filter = {
    companyId,
    companyAccessId: identity.companyAccessId,
    isDeleted: false,
  };

  if (query.attendanceId) {
    filter.attendanceId = query.attendanceId;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.requestType) {
    filter.requestType = query.requestType;
  }

  if (query.fromDate || query.toDate) {
    filter.attendanceDate = {};

    if (query.fromDate) {
      filter.attendanceDate.$gte = query.fromDate;
    }

    if (query.toDate) {
      filter.attendanceDate.$lte = query.toDate;
    }
  }

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AttendanceRegularization.find(filter)
      .sort({
        attendanceDate: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .populate(regularizationPopulate),

    AttendanceRegularization.countDocuments(filter),
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
 * LIST REGULARIZATIONS
 * ============================================================
 */

export const listAttendanceRegularizations = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  await resolveCompany({
    companyId,
  });

  const scopeFilter = await buildRegularizationReadFilter({
    requesterContext,
    companyId,
  });

  const userFilter = {};

  if (query.employeeId) {
    userFilter.employeeId = query.employeeId;
  }

  if (query.companyAccessId) {
    userFilter.companyAccessId = query.companyAccessId;
  }

  if (query.attendanceId) {
    userFilter.attendanceId = query.attendanceId;
  }

  if (query.status) {
    userFilter.status = query.status;
  }

  if (query.requestType) {
    userFilter.requestType = query.requestType;
  }

  if (query.fromDate || query.toDate) {
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
   * Never merge user supplied filters into the authorization
   * filter because companyAccessId could overwrite scope.
   */
  const filter =
    Object.keys(userFilter).length > 0
      ? {
          $and: [scopeFilter, userFilter],
        }
      : scopeFilter;

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AttendanceRegularization.find(filter)
      .sort({
        attendanceDate: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .populate(regularizationPopulate),

    AttendanceRegularization.countDocuments(filter),
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
 * GET REGULARIZATION BY ID
 * ============================================================
 */

export const getAttendanceRegularizationById = async ({
  companyId,
  regularizationId,
  requesterContext,
}) => {
  await resolveCompany({
    companyId,
  });

  const regularization = await AttendanceRegularization.findOne({
    _id: regularizationId,
    companyId,
    isDeleted: false,
  });

  if (!regularization) {
    throw new ApiError(404, "Attendance regularization request not found.");
  }

  const allowed = await canAccessCompanyAccess({
    requesterContext,
    companyId,
    targetCompanyAccessId: regularization.companyAccessId,
  });

  if (!allowed) {
    throw new ApiError(
      403,
      "You are not allowed to access this regularization request.",
    );
  }

  await regularization.populate(regularizationPopulate);

  return regularization;
};

/**
 * ============================================================
 * RECOMMEND REGULARIZATION
 * ============================================================
 */

export const recommendAttendanceRegularization = async ({
  companyId,
  regularizationId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      await resolveCompany({
        companyId,
        session,
      });

      const regularization = await AttendanceRegularization.findOne({
        _id: regularizationId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!regularization) {
        throw new ApiError(404, "Attendance regularization request not found.");
      }

      if (regularization.status !== "PENDING") {
        throw new ApiError(
          409,
          "Only pending regularization requests can be recommended.",
        );
      }

      /**
       * Managers cannot recommend their own request.
       */
      const allowed = await canManageCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: regularization.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!allowed) {
        throw new ApiError(
          403,
          "You are not allowed to recommend this regularization request.",
        );
      }

      regularization.status = "RECOMMENDED";

      regularization.recommendedBy = requesterContext.userId || null;

      regularization.recommendedAt = new Date();

      regularization.recommendationNote = normalizeText(data.note);

      regularization.updatedBy = requesterContext.userId || null;

      await regularization.save({
        session,
      });

      result = regularization;
    });

    await result.populate(regularizationPopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * ANOMALY RESOLUTION
 * ============================================================
 */

const resolveMissingCheckoutAnomaly = (attendance) => {
  if (!Array.isArray(attendance.anomalies)) {
    return;
  }

  for (const anomaly of attendance.anomalies) {
    if (anomaly.type === "MISSING_CHECKOUT" && anomaly.status === "OPEN") {
      anomaly.status = "RESOLVED";
    }
  }
};

/**
 * ============================================================
 * SESSION CHRONOLOGY VALIDATION
 * ============================================================
 */

const validateWorkSessionChronology = (attendance) => {
  const sessions = [...(attendance.workSessions || [])].sort(
    (a, b) => new Date(a.checkInAt) - new Date(b.checkInAt),
  );

  for (let index = 0; index < sessions.length; index += 1) {
    const current = sessions[index];

    if (
      current.checkOutAt &&
      new Date(current.checkOutAt) <= new Date(current.checkInAt)
    ) {
      throw new ApiError(
        400,
        "A corrected work session must end after it starts.",
      );
    }

    const next = sessions[index + 1];

    if (
      next &&
      current.checkOutAt &&
      new Date(current.checkOutAt) > new Date(next.checkInAt)
    ) {
      throw new ApiError(
        409,
        "The requested correction would overlap another work session.",
      );
    }
  }
};

/**
 * ============================================================
 * BREAK CHRONOLOGY VALIDATION
 * ============================================================
 */

const validateBreakChronology = (attendance) => {
  const breaks = [...(attendance.breaks || [])].sort(
    (a, b) => new Date(a.startedAt) - new Date(b.startedAt),
  );

  for (let index = 0; index < breaks.length; index += 1) {
    const current = breaks[index];

    if (
      current.endedAt &&
      new Date(current.endedAt) <= new Date(current.startedAt)
    ) {
      throw new ApiError(400, "A corrected break must end after it starts.");
    }

    const next = breaks[index + 1];

    if (
      next &&
      current.endedAt &&
      new Date(current.endedAt) > new Date(next.startedAt)
    ) {
      throw new ApiError(
        409,
        "The requested correction would overlap another break.",
      );
    }
  }
};

/**
 * ============================================================
 * BREAK WITHIN WORK SESSION VALIDATION
 * ============================================================
 */

const validateBreakWithinWorkSession = (attendance) => {
  const workSessions = attendance.workSessions || [];
  const breaks = attendance.breaks || [];

  for (const attendanceBreak of breaks) {
    if (!attendanceBreak.startedAt || !attendanceBreak.endedAt) {
      continue;
    }

    const breakStart = new Date(attendanceBreak.startedAt);
    const breakEnd = new Date(attendanceBreak.endedAt);

    const containingSession = workSessions.find((workSession) => {
      if (!workSession.checkInAt || !workSession.checkOutAt) {
        return false;
      }

      const sessionStart = new Date(workSession.checkInAt);
      const sessionEnd = new Date(workSession.checkOutAt);

      return breakStart >= sessionStart && breakEnd <= sessionEnd;
    });

    if (!containingSession) {
      throw new ApiError(
        409,
        "A break must occur entirely within a completed work session.",
      );
    }
  }
};

/**
 * ============================================================
 * APPLY APPROVED REGULARIZATION
 * ============================================================
 */

const applyApprovedRegularization = async ({
  regularization,
  attendance,
  company,
  requesterContext,
  session,
}) => {
  if (regularization.status !== "APPROVED") {
    throw new ApiError(
      409,
      "Only approved regularization requests can be applied.",
    );
  }

  /**
   * Idempotency protection.
   */
  if (regularization.applicationStatus === "APPLIED") {
    return attendance;
  }

  switch (regularization.requestType) {
    /**
     * ======================================================
     * MISSING CHECK-IN
     * ======================================================
     *
     * V1 strategy:
     *
     * If targetWorkSessionId exists, use that session.
     *
     * Otherwise use the earliest existing session as the
     * boundary. We do NOT fabricate GPS evidence.
     */
    case "MISSING_CHECK_IN": {
      /**
       * A genuine missing check-in means that no work session
       * exists for this work period.
       *
       * On approval we reconstruct a historical CLOSED session
       * using the employee-requested check-in and checkout times.
       *
       * GPS is intentionally null because historical location
       * evidence must never be fabricated by an approver.
       */

      if (regularization.targetWorkSessionId) {
        throw new ApiError(
          409,
          "Missing check-in regularization must not target an existing work session.",
        );
      }

      const requestedCheckInAt = new Date(regularization.requestedCheckInAt);

      const requestedCheckOutAt = new Date(regularization.requestedCheckOutAt);

      if (requestedCheckOutAt <= requestedCheckInAt) {
        throw new ApiError(
          400,
          "Requested checkout time must be later than requested check-in time.",
        );
      }

      attendance.workSessions.push({
        checkInAt: requestedCheckInAt,

        checkOutAt: requestedCheckOutAt,

        checkInLocation: null,

        checkOutLocation: null,

        checkInSource: "ADMIN_CORRECTION",

        checkOutSource: "ADMIN_CORRECTION",

        workedMinutes: calculateMinutes(
          requestedCheckInAt,
          requestedCheckOutAt,
        ),

        status: "CLOSED",
      });

      break;
    }

    /**
     * ======================================================
     * MISSING CHECKOUT
     * ======================================================
     */
    case "MISSING_CHECKOUT": {
      const targetSession = requireTargetWorkSession(
        attendance,
        regularization.targetWorkSessionId,
      );

      if (targetSession.checkOutAt) {
        throw new ApiError(
          409,
          "The selected work session already contains a checkout time.",
        );
      }

      const requestedCheckOutAt = new Date(regularization.requestedCheckOutAt);

      if (requestedCheckOutAt <= new Date(targetSession.checkInAt)) {
        throw new ApiError(
          400,
          "Requested checkout time must be later than check-in time.",
        );
      }

      targetSession.checkOutAt = requestedCheckOutAt;

      targetSession.checkOutSource = "ADMIN_CORRECTION";

      targetSession.checkOutLocation = null;

      targetSession.workedMinutes = calculateMinutes(
        targetSession.checkInAt,
        targetSession.checkOutAt,
      );

      targetSession.status = "CLOSED";

      resolveMissingCheckoutAnomaly(attendance);

      break;
    }

    /**
     * ======================================================
     * CHECK-IN TIME CORRECTION
     * ======================================================
     */
    case "CHECK_IN_TIME_CORRECTION": {
      const targetSession = requireTargetWorkSession(
        attendance,
        regularization.targetWorkSessionId,
      );

      const requestedCheckInAt = new Date(regularization.requestedCheckInAt);

      if (
        targetSession.checkOutAt &&
        requestedCheckInAt >= new Date(targetSession.checkOutAt)
      ) {
        throw new ApiError(
          400,
          "Requested check-in time must be earlier than checkout time.",
        );
      }

      targetSession.checkInAt = requestedCheckInAt;

      targetSession.checkInSource = "ADMIN_CORRECTION";

      // Preserve original check-in GPS evidence.

      if (targetSession.checkOutAt) {
        targetSession.workedMinutes = calculateMinutes(
          targetSession.checkInAt,
          targetSession.checkOutAt,
        );
      }

      break;
    }

    /**
     * ======================================================
     * CHECKOUT TIME CORRECTION
     * ======================================================
     */
    case "CHECKOUT_TIME_CORRECTION": {
      const targetSession = requireTargetWorkSession(
        attendance,
        regularization.targetWorkSessionId,
      );

      const requestedCheckOutAt = new Date(regularization.requestedCheckOutAt);

      if (requestedCheckOutAt <= new Date(targetSession.checkInAt)) {
        throw new ApiError(
          400,
          "Requested checkout time must be later than check-in time.",
        );
      }

      targetSession.checkOutAt = requestedCheckOutAt;

      targetSession.checkOutSource = "ADMIN_CORRECTION";

      targetSession.workedMinutes = calculateMinutes(
        targetSession.checkInAt,
        targetSession.checkOutAt,
      );

      targetSession.status = "CLOSED";

      break;
    }

    /**
     * ======================================================
     * BREAK CORRECTION
     * ======================================================
     */
    case "BREAK_CORRECTION": {
      const targetBreak = requireTargetBreak(
        attendance,
        regularization.targetBreakId,
      );

      const requestedStart = new Date(regularization.requestedBreakStartAt);

      const requestedEnd = new Date(regularization.requestedBreakEndAt);

      if (requestedEnd <= requestedStart) {
        throw new ApiError(
          400,
          "Requested break end time must be later than break start time.",
        );
      }

      targetBreak.startedAt = requestedStart;

      targetBreak.endedAt = requestedEnd;

      targetBreak.durationMinutes = calculateMinutes(
        requestedStart,
        requestedEnd,
      );

      targetBreak.status = "COMPLETED";

      break;
    }

    /**
     * ======================================================
     * BREAK EXTENSION
     * ======================================================
     *
     * This represents an approved allowance adjustment.
     *
     * It does NOT fabricate or change the actual break
     * timestamps.
     */
    case "BREAK_EXTENSION": {
      requireTargetBreak(attendance, regularization.targetBreakId);

      const extensionMinutes = Number(
        regularization.requestedBreakExtensionMinutes || 0,
      );

      attendance.adjustments.push({
        type: "BREAK_ALLOWANCE",

        minutes: extensionMinutes,

        reason: `Approved attendance regularization: ${regularization.reason}`,

        approvedBy: requesterContext.userId || null,

        approvedAt: new Date(),
      });

      break;
    }

    /**
     * ======================================================
     * OTHER
     * ======================================================
     *
     * OTHER requests are workflow/audit-only because there
     * is no deterministic attendance mutation associated
     * with them.
     */
    case "OTHER":
      break;

    default:
      throw new ApiError(
        400,
        "Unsupported attendance regularization request type.",
      );
  }

  validateWorkSessionChronology(attendance);

  validateBreakChronology(attendance);

  validateBreakWithinWorkSession(attendance);

  attendance.updatedBy = requesterContext.userId || null;

  attendance.calculationStatus = "RECALCULATION_REQUIRED";

  /**
   * Payroll safety.
   *
   * Attendance facts may be corrected for audit/history,
   * but finalized payroll must never be silently recomputed.
   */
  if (attendance.payrollStatus === "FINALIZED") {
    regularization.affectsFinalizedPayroll = true;

    regularization.payrollAdjustmentRequired = true;
  }

  await recalculateAttendance({
    attendance,
    timezone: company.timezone || "Asia/Kolkata",
    session,
  });

  regularization.applicationStatus = "APPLIED";

  regularization.appliedAt = new Date();

  regularization.appliedBy = requesterContext.userId || null;

  regularization.applicationError = "";

  return attendance;
};

/**
 * ============================================================
 * APPROVE REGULARIZATION
 * ============================================================
 */

export const approveAttendanceRegularization = async ({
  companyId,
  regularizationId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const company = await resolveCompany({
        companyId,
        session,
      });

      const regularization = await AttendanceRegularization.findOne({
        _id: regularizationId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!regularization) {
        throw new ApiError(404, "Attendance regularization request not found.");
      }

      if (!["PENDING", "RECOMMENDED"].includes(regularization.status)) {
        throw new ApiError(
          409,
          "Only pending or recommended regularization requests can be approved.",
        );
      }

      /**
       * Permission is enforced by route middleware.
       *
       * Here we enforce employee scope and prevent self
       * approval.
       */
      const allowed = await canManageCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: regularization.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!allowed) {
        throw new ApiError(
          403,
          "You are not allowed to approve this regularization request.",
        );
      }

      const attendance = await Attendance.findOne({
        _id: regularization.attendanceId,
        companyId,
        companyAccessId: regularization.companyAccessId,
        employeeId: regularization.employeeId,
        isDeleted: false,
      }).session(session);

      if (!attendance) {
        throw new ApiError(
          404,
          "Attendance record linked to this regularization request was not found.",
        );
      }

      /**
       * Re-check the policy at approval time.
       *
       * The request may have remained pending while policy
       * configuration changed.
       */
      const policy = await resolveAttendancePolicy({
        companyId,
        attendance,
        session,
      });

      validateRegularizationTypeAgainstPolicy({
        requestType: regularization.requestType,
        policy,
      });

      regularization.status = "APPROVED";

      regularization.approvedBy = requesterContext.userId || null;

      regularization.approvedAt = new Date();

      regularization.approvalNote = normalizeText(data.note);

      regularization.updatedBy = requesterContext.userId || null;

      try {
        await applyApprovedRegularization({
          regularization,
          attendance,
          company,
          requesterContext,
          session,
        });
      } catch (error) {
        /**
         * Because approval + application are inside one
         * MongoDB transaction, throwing here rolls back the
         * APPROVED state as well.
         *
         * We intentionally do not persist FAILED inside the
         * same rolled-back transaction.
         */
        throw error;
      }

      await regularization.save({
        session,
      });

      result = regularization;
    });

    await result.populate(regularizationPopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * REJECT REGULARIZATION
 * ============================================================
 */

export const rejectAttendanceRegularization = async ({
  companyId,
  regularizationId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      await resolveCompany({
        companyId,
        session,
      });

      const regularization = await AttendanceRegularization.findOne({
        _id: regularizationId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!regularization) {
        throw new ApiError(404, "Attendance regularization request not found.");
      }

      if (!["PENDING", "RECOMMENDED"].includes(regularization.status)) {
        throw new ApiError(
          409,
          "Only pending or recommended regularization requests can be rejected.",
        );
      }

      const allowed = await canManageCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: regularization.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!allowed) {
        throw new ApiError(
          403,
          "You are not allowed to reject this regularization request.",
        );
      }

      regularization.status = "REJECTED";

      regularization.rejectedBy = requesterContext.userId || null;

      regularization.rejectedAt = new Date();

      regularization.rejectionReason = normalizeText(data.reason);

      regularization.updatedBy = requesterContext.userId || null;

      await regularization.save({
        session,
      });

      result = regularization;
    });

    await result.populate(regularizationPopulate);

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * CANCEL OWN REGULARIZATION
 * ============================================================
 */

export const cancelAttendanceRegularization = async ({
  companyId,
  regularizationId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      await resolveCompany({
        companyId,
        session,
      });

      const identity = getSelfAttendanceIdentity({
        requesterContext,
        companyId,
      });

      const regularization = await AttendanceRegularization.findOne({
        _id: regularizationId,
        companyId,
        companyAccessId: identity.companyAccessId,
        isDeleted: false,
      }).session(session);

      if (!regularization) {
        throw new ApiError(404, "Attendance regularization request not found.");
      }

      /**
       * Once recommended, management has already acted on the
       * request. Employee cancellation is no longer allowed.
       */
      if (regularization.status !== "PENDING") {
        throw new ApiError(
          409,
          "Only pending regularization requests can be cancelled.",
        );
      }

      regularization.status = "CANCELLED";

      regularization.cancelledBy = requesterContext.userId || null;

      regularization.cancelledAt = new Date();

      regularization.cancellationReason = normalizeText(data.reason);

      regularization.updatedBy = requesterContext.userId || null;

      await regularization.save({
        session,
      });

      result = regularization;
    });

    await result.populate(regularizationPopulate);

    return result;
  } finally {
    await session.endSession();
  }
};
