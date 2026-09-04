import mongoose from "mongoose";

import FieldVisit from "./fieldVisit.model.js";
import Attendance from "./attendance.model.js";
import AttendanceLocation from "./attendanceLocation.model.js";
import AttendancePolicy from "./attendancePolicy.model.js";

import Client from "../clients/client.model.js";
import Employee from "../employees/employee.model.js";

import { ApiError } from "../../utils/ApiError.js";

import {
  calculateDistanceMeters,
  isLocationAccuracyAcceptable,
  validateLocationCapturedAt,
} from "./attendance.utils.js";

import {
  buildFieldVisitReadFilter,
  canAccessCompanyAccess,
  getSelfAttendanceIdentity,
} from "./attendance.scope.js";

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * ============================================================
 * POPULATE
 * ============================================================
 */

const populateFieldVisit = (query) =>
  query
    .populate({
      path: "companyAccessId",
      select:
        "userId roleId employeeCode designation employmentType departmentId teamId reportingManagerId workLocationType workLocationName attendanceMode shiftId status",
      populate: [
        {
          path: "roleId",
          select: "name code scopeType status",
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
          path: "shiftId",
          select:
            "name code startTime endTime isOvernight fullDayMinutes halfDayMinutes lateGraceMinutes earlyCheckoutGraceMinutes standardBreakMinutes maxBreakMinutes allowMultipleBreaks status",
        },
      ],
    })
    .populate({
      path: "employeeId",
      select: "companyAccessId userId status",
      populate: {
        path: "userId",
        select:
          "firstName middleName lastName displayName email mobile profilePhoto status",
      },
    })
    .populate({
      path: "attendanceId",
      select:
        "attendanceDate attendanceMode firstCheckInAt lastCheckOutAt totalWorkedMinutes totalBreakMinutes attendanceStatus calculationStatus payrollStatus",
    })
    .populate({
      path: "clientId",
      select: "name code clientType engagementType status",
    })
    .populate({
      path: "startLocation.attendanceLocationId",
      select:
        "name code locationType latitude longitude geofenceRadiusMeters status",
    })
    .populate({
      path: "endLocation.attendanceLocationId",
      select:
        "name code locationType latitude longitude geofenceRadiusMeters status",
    })
    .populate({
      path: "cancelledBy",
      select: "firstName lastName displayName email",
    });

/**
 * ============================================================
 * GENERIC HELPERS
 * ============================================================
 */

const toObjectIdString = (value) => {
  if (!value) {
    return "";
  }

  return String(value?._id ?? value);
};

const calculateDurationMinutes = (startedAt, endedAt) => {
  if (!startedAt || !endedAt) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
        (1000 * 60),
    ),
  );
};

const normalizeText = (value, maxLength = 500) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const appendTextSafely = ({
  existingText = "",
  newText = "",
  maxLength = 500,
}) => {
  const existing = String(existingText || "").trim();
  const incoming = String(newText || "").trim();

  if (!incoming) {
    return existing.slice(0, maxLength);
  }

  if (!existing) {
    return incoming.slice(0, maxLength);
  }

  return `${existing}\n${incoming}`.slice(0, maxLength);
};

/**
 * ============================================================
 * REQUEST META
 * ============================================================
 */

const buildLocationEvidence = async ({
  companyId,
  location,
  requestMeta = {},
  policy = null,
  currentTime = new Date(),
  session = null,
}) => {
  if (!location) {
    throw new ApiError(400, "GPS location is required for field visits.");
  }

  const {
    latitude,
    longitude,
    accuracy = null,
    capturedAt = null,
    attendanceLocationId = null,
    addressText = "",
  } = location;

  /**
   * GPS coordinates are mandatory for field visits.
   */
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new ApiError(400, "Valid latitude and longitude are required.");
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new ApiError(400, "Invalid GPS coordinates.");
  }

  /**
   * GPS accuracy policy.
   */
  if (policy?.maximumAcceptedAccuracyMeters) {
    const accuracyAcceptable = isLocationAccuracyAcceptable(
      accuracy,
      policy.maximumAcceptedAccuracyMeters,
    );

    if (!accuracyAcceptable) {
      if (accuracy === null || accuracy === undefined) {
        throw new ApiError(
          400,
          "GPS accuracy information is required for field visits.",
        );
      }

      throw new ApiError(
        400,
        `GPS accuracy is too low. Accuracy must be within ${policy.maximumAcceptedAccuracyMeters} meters.`,
      );
    }
  }
  /**
   * GPS timestamp validation.
   *
   * Prevent stale GPS fixes and timestamps significantly
   * ahead of the server action time.
   */
  const capturedAtResult = validateLocationCapturedAt({
    capturedAt,
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

  let knownLocation = null;

  let distanceFromLocationMeters = null;
  let withinGeofence = null;

  /**
   * Validate configured AttendanceLocation.
   */
  if (attendanceLocationId) {
    knownLocation = await AttendanceLocation.findOne({
      _id: attendanceLocationId,

      companyId,

      status: "ACTIVE",

      isDeleted: false,

      allowFieldVisit: true,

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
    }).session(session);

    if (!knownLocation) {
      throw new ApiError(
        400,
        "Selected attendance location is unavailable, inactive, expired, or does not allow field visits.",
      );
    }

    distanceFromLocationMeters = calculateDistanceMeters(
      latitude,
      longitude,
      knownLocation.latitude,
      knownLocation.longitude,
    );

    withinGeofence =
      distanceFromLocationMeters <= Number(knownLocation.geofenceRadiusMeters);
  }

  return {
    latitude,

    longitude,

    accuracy,

    capturedAt: capturedAtResult.capturedAt,

    attendanceLocationId: knownLocation?._id ?? null,

    distanceFromLocationMeters,

    withinGeofence,

    addressText: String(addressText || "").slice(0, 1000),

    ipAddress: String(requestMeta.ipAddress || "").slice(0, 100),

    userAgent: String(requestMeta.userAgent || "").slice(0, 1000),
  };
};

/**
 * ============================================================
 * SELF EMPLOYEE RESOLUTION
 * ============================================================
 */

const resolveSelfEmployee = async ({
  companyId,
  companyAccessId,
  session = null,
}) => {
  const employee = await Employee.findOne({
    companyId,
    companyAccessId,
    isDeleted: false,
  }).session(session);

  if (!employee) {
    throw new ApiError(
      404,
      "Employee profile was not found for the authenticated company access.",
    );
  }

  if (employee.status !== "ACTIVE") {
    throw new ApiError(403, "Employee profile is not active.");
  }

  return employee;
};

/**
 * ============================================================
 * ACTIVE ATTENDANCE
 * ============================================================
 */

const resolveActiveAttendance = async ({
  companyId,
  companyAccessId,
  session = null,
}) => {
  /**
   * We deliberately search for an OPEN session rather than
   * calculating today's date here.
   *
   * This also handles overnight shifts correctly.
   */
  const attendance = await Attendance.findOne({
    companyId,
    companyAccessId,
    isDeleted: false,

    workSessions: {
      $elemMatch: {
        status: "OPEN",
        checkOutAt: null,
      },
    },
  })
    .sort({
      attendanceDate: -1,
      createdAt: -1,
    })
    .session(session);

  if (!attendance) {
    throw new ApiError(400, "You must check in before starting a field visit.");
  }

  return attendance;
};

/**
 * ============================================================
 * ATTENDANCE POLICY
 * ============================================================
 */

const resolveAttendancePolicy = async ({
  attendance,
  companyId,
  session = null,
}) => {
  if (!attendance.attendancePolicyId) {
    return null;
  }

  const policy = await AttendancePolicy.findOne({
    _id: attendance.attendancePolicyId,
    companyId,
    isDeleted: false,
  }).session(session);

  return policy;
};

/**
 * ============================================================
 * CLIENT VALIDATION
 * ============================================================
 */

const resolveClient = async ({ companyId, clientId, session = null }) => {
  if (!clientId) {
    return null;
  }

  const client = await Client.findOne({
    _id: clientId,
    companyId,
    status: "ACTIVE",
    isDeleted: false,
  }).session(session);

  if (!client) {
    throw new ApiError(400, "Selected client was not found or is inactive.");
  }

  return client;
};

/**
 * ============================================================
 * ACTIVE BREAK
 * ============================================================
 */

const hasActiveBreak = (attendance) =>
  attendance.breaks?.some(
    (attendanceBreak) =>
      attendanceBreak.status === "ACTIVE" && !attendanceBreak.endedAt,
  ) ?? false;

/**
 * ============================================================
 * START FIELD VISIT
 * ============================================================
 */

export const startFieldVisit = async ({
  companyId,
  data,
  requesterContext,
  requestMeta = {},
}) => {
  const mongoSession = await mongoose.startSession();

  try {
    let createdFieldVisit = null;

    await mongoSession.withTransaction(async () => {
      /**
       * Self-service action.
       *
       * Do not accept arbitrary employee/companyAccess IDs
       * from the request body.
       */
      const identity = getSelfAttendanceIdentity({
        requesterContext,
        companyId,
      });

      const employee = await resolveSelfEmployee({
        companyId,
        companyAccessId: identity.companyAccessId,
        session: mongoSession,
      });

      const attendance = await resolveActiveAttendance({
        companyId,
        companyAccessId: identity.companyAccessId,
        session: mongoSession,
      });

      /**
       * Employee cannot simultaneously be on break
       * and perform an official field visit.
       */
      if (hasActiveBreak(attendance)) {
        throw new ApiError(
          400,
          "Please end your active break before starting a field visit.",
        );
      }

      /**
       * Defensive application-level check.
       *
       * The unique partial database index provides the
       * second layer of protection.
       */
      const existingVisit = await FieldVisit.findOne({
        companyId,
        companyAccessId: identity.companyAccessId,
        status: "IN_PROGRESS",
        isDeleted: false,
      }).session(mongoSession);

      if (existingVisit) {
        throw new ApiError(409, "You already have an active field visit.");
      }

      const policy = await resolveAttendancePolicy({
        attendance,
        companyId,
        session: mongoSession,
      });

      /**
       * If your policy model exposes fieldVisitEnabled,
       * enforce it here.
       */
      if (policy && policy.fieldVisitEnabled === false) {
        throw new ApiError(
          403,
          "Field visits are disabled by the attendance policy.",
        );
      }

      /**
       * Enforce field-visit purpose policy.
       */
      if (
        policy?.fieldVisitPurposeRequired === true &&
        !String(data.purpose || "").trim()
      ) {
        throw new ApiError(
          400,
          "Field visit purpose is required by the attendance policy.",
        );
      }

      const client = await resolveClient({
        companyId,
        clientId: data.clientId,
        session: mongoSession,
      });

      const currentTime = new Date();

      const startLocation = await buildLocationEvidence({
        companyId,
        location: data.location,
        requestMeta,
        policy,
        currentTime,
        session: mongoSession,
      });
      const [fieldVisit] = await FieldVisit.create(
        [
          {
            companyId,

            companyAccessId: identity.companyAccessId,

            employeeId: employee._id,

            attendanceId: attendance._id,

            attendanceDate: attendance.attendanceDate,

            visitType: data.visitType || "CLIENT_VISIT",

            clientId: client?._id ?? null,

            siteName: normalizeText(data.siteName, 200),

            purpose: normalizeText(data.purpose, 1500),

            startedAt: currentTime,

            startLocation,

            endedAt: null,

            endLocation: null,

            durationMinutes: 0,

            outcome: "",

            notes: normalizeText(data.notes, 2000),

            status: "IN_PROGRESS",

            createdBy: identity.userId,

            updatedBy: identity.userId,
          },
        ],
        {
          session: mongoSession,
        },
      );

      createdFieldVisit = fieldVisit;
    });

    return await populateFieldVisit(FieldVisit.findById(createdFieldVisit._id));
  } catch (error) {
    /**
     * Mongo duplicate-key protection for simultaneous
     * active-field-visit requests.
     */
    if (error?.code === 11000) {
      throw new ApiError(409, "You already have an active field visit.");
    }

    throw error;
  } finally {
    await mongoSession.endSession();
  }
};

/**
 * ============================================================
 * END FIELD VISIT
 * ============================================================
 */

export const endFieldVisit = async ({
  companyId,
  fieldVisitId,
  data,
  requesterContext,
  requestMeta = {},
}) => {
  const mongoSession = await mongoose.startSession();

  try {
    let updatedFieldVisitId = null;

    await mongoSession.withTransaction(async () => {
      const identity = getSelfAttendanceIdentity({
        requesterContext,
        companyId,
      });

      const fieldVisit = await FieldVisit.findOne({
        _id: fieldVisitId,
        companyId,
        companyAccessId: identity.companyAccessId,
        isDeleted: false,
      }).session(mongoSession);

      if (!fieldVisit) {
        throw new ApiError(404, "Field visit was not found.");
      }

      if (fieldVisit.status !== "IN_PROGRESS") {
        throw new ApiError(400, "Only an active field visit can be ended.");
      }

      const attendance = await Attendance.findOne({
        _id: fieldVisit.attendanceId,
        companyId,
        companyAccessId: identity.companyAccessId,
        isDeleted: false,
      }).session(mongoSession);

      if (!attendance) {
        throw new ApiError(
          404,
          "Attendance linked to this field visit was not found.",
        );
      }

      const policy = await resolveAttendancePolicy({
        attendance,
        companyId,
        session: mongoSession,
      });

      if (
        policy?.fieldVisitOutcomeRequired === true &&
        !String(data.outcome || "").trim()
      ) {
        throw new ApiError(
          400,
          "Field visit outcome is required by the attendance policy.",
        );
      }

      const currentTime = new Date();

      const endLocation = await buildLocationEvidence({
        companyId,
        location: data.location,
        requestMeta,
        policy,
        currentTime,
        session: mongoSession,
      });
      fieldVisit.endedAt = currentTime;

      fieldVisit.endLocation = endLocation;

      fieldVisit.durationMinutes = calculateDurationMinutes(
        fieldVisit.startedAt,
        currentTime,
      );

      fieldVisit.outcome = normalizeText(data.outcome, 2000);
      /**
       * Preserve the start note.
       *
       * If the end request contains notes, append rather
       * than silently destroy the original note.
       */
      fieldVisit.notes = appendTextSafely({
        existingText: fieldVisit.notes,
        newText: data.notes,
        maxLength: 2000,
      });

      fieldVisit.status = "COMPLETED";

      fieldVisit.updatedBy = identity.userId;

      await fieldVisit.save({
        session: mongoSession,
      });

      updatedFieldVisitId = fieldVisit._id;
    });

    return await populateFieldVisit(FieldVisit.findById(updatedFieldVisitId));
  } finally {
    await mongoSession.endSession();
  }
};

/**
 * ============================================================
 * CANCEL FIELD VISIT
 * ============================================================
 */

export const cancelFieldVisit = async ({
  companyId,
  fieldVisitId,
  data,
  requesterContext,
}) => {
  const mongoSession = await mongoose.startSession();

  try {
    let updatedFieldVisitId = null;

    await mongoSession.withTransaction(async () => {
      const identity = getSelfAttendanceIdentity({
        requesterContext,
        companyId,
      });

      const fieldVisit = await FieldVisit.findOne({
        _id: fieldVisitId,
        companyId,
        companyAccessId: identity.companyAccessId,
        isDeleted: false,
      }).session(mongoSession);

      if (!fieldVisit) {
        throw new ApiError(404, "Field visit was not found.");
      }

      if (fieldVisit.status !== "IN_PROGRESS") {
        throw new ApiError(400, "Only an active field visit can be cancelled.");
      }

      const currentTime = new Date();

      fieldVisit.status = "CANCELLED";

      fieldVisit.cancelledBy = identity.userId;

      fieldVisit.cancelledAt = currentTime;

      fieldVisit.cancellationReason = data.reason;

      fieldVisit.updatedBy = identity.userId;

      await fieldVisit.save({
        session: mongoSession,
      });

      updatedFieldVisitId = fieldVisit._id;
    });

    return await populateFieldVisit(FieldVisit.findById(updatedFieldVisitId));
  } finally {
    await mongoSession.endSession();
  }
};

/**
 * ============================================================
 * MY ACTIVE FIELD VISIT
 * ============================================================
 */

export const getMyActiveFieldVisit = async ({
  companyId,
  requesterContext,
}) => {
  const identity = getSelfAttendanceIdentity({
    requesterContext,
    companyId,
  });

  const fieldVisit = await populateFieldVisit(
    FieldVisit.findOne({
      companyId,
      companyAccessId: identity.companyAccessId,
      status: "IN_PROGRESS",
      isDeleted: false,
    }),
  );

  return fieldVisit;
};

/**
 * ============================================================
 * MY FIELD VISIT HISTORY
 * ============================================================
 */

export const getMyFieldVisitHistory = async ({
  companyId,
  query,
  requesterContext,
}) => {
  const identity = getSelfAttendanceIdentity({
    requesterContext,
    companyId,
  });

  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);

  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const filters = {
    companyId,

    companyAccessId: identity.companyAccessId,

    isDeleted: false,
  };

  if (query.status) {
    filters.status = query.status;
  }

  if (query.visitType) {
    filters.visitType = query.visitType;
  }

  if (query.clientId) {
    filters.clientId = query.clientId;
  }

  if (query.date) {
    filters.attendanceDate = query.date;
  } else if (query.fromDate || query.toDate) {
    filters.attendanceDate = {};

    if (query.fromDate) {
      filters.attendanceDate.$gte = query.fromDate;
    }

    if (query.toDate) {
      filters.attendanceDate.$lte = query.toDate;
    }
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    populateFieldVisit(
      FieldVisit.find(filters)
        .sort({
          attendanceDate: -1,
          startedAt: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit),
    ),

    FieldVisit.countDocuments(filters),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items,

    pagination: {
      page,
      limit,
      total,
      totalPages,

      hasNextPage: page < totalPages,

      hasPreviousPage: page > 1,
    },
  };
};

/**
 * ============================================================
 * LIST FIELD VISITS
 * ============================================================
 *
 * IMPORTANT:
 *
 * Scope restrictions are NEVER overwritten by query filters.
 *
 * We use $and:
 *
 * scope filter
 *      AND
 * user-requested filters
 *
 * Therefore TEAM/DEPARTMENT/self users cannot broaden
 * visibility by passing another companyAccessId.
 */
export const listFieldVisits = async ({
  companyId,
  query,
  requesterContext,
}) => {
  const page = Math.max(Number(query.page) || DEFAULT_PAGE, 1);

  const limit = Math.min(
    Math.max(Number(query.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const scopeFilter = await buildFieldVisitReadFilter({
    requesterContext,
    companyId,
  });

  const userFilters = {
    companyId,
    isDeleted: false,
  };

  if (query.companyAccessId) {
    userFilters.companyAccessId = query.companyAccessId;
  }

  if (query.employeeId) {
    userFilters.employeeId = query.employeeId;
  }

  if (query.attendanceId) {
    userFilters.attendanceId = query.attendanceId;
  }

  if (query.clientId) {
    userFilters.clientId = query.clientId;
  }

  if (query.visitType) {
    userFilters.visitType = query.visitType;
  }

  if (query.status) {
    userFilters.status = query.status;
  }

  if (query.date) {
    userFilters.attendanceDate = query.date;
  } else if (query.fromDate || query.toDate) {
    userFilters.attendanceDate = {};

    if (query.fromDate) {
      userFilters.attendanceDate.$gte = query.fromDate;
    }

    if (query.toDate) {
      userFilters.attendanceDate.$lte = query.toDate;
    }
  }

  /**
   * Department/team are CompanyAccess properties rather
   * than FieldVisit properties.
   */
  if (query.departmentId || query.teamId) {
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

    const matchingAccessIds = await mongoose
      .model("CompanyAccess")
      .find(accessFilter)
      .distinct("_id");

    userFilters.companyAccessId = {
      $in: matchingAccessIds,
    };
  }

  const finalFilter = {
    $and: [scopeFilter, userFilters],
  };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    populateFieldVisit(
      FieldVisit.find(finalFilter)
        .sort({
          attendanceDate: -1,
          startedAt: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit),
    ),

    FieldVisit.countDocuments(finalFilter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items,

    pagination: {
      page,
      limit,
      total,
      totalPages,

      hasNextPage: page < totalPages,

      hasPreviousPage: page > 1,
    },
  };
};

/**
 * ============================================================
 * GET FIELD VISIT BY ID
 * ============================================================
 */

export const getFieldVisitById = async ({
  companyId,
  fieldVisitId,
  requesterContext,
}) => {
  const fieldVisit = await FieldVisit.findOne({
    _id: fieldVisitId,
    companyId,
    isDeleted: false,
  });

  if (!fieldVisit) {
    throw new ApiError(404, "Field visit was not found.");
  }

  const allowed = await canAccessCompanyAccess({
    requesterContext,

    companyId,

    targetCompanyAccessId: fieldVisit.companyAccessId,
  });

  if (!allowed) {
    throw new ApiError(
      403,
      "You do not have permission to access this field visit.",
    );
  }

  return await populateFieldVisit(FieldVisit.findById(fieldVisit._id));
};
