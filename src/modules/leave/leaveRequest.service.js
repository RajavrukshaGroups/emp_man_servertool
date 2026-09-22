import mongoose from "mongoose";

import LeaveRequest from "./leaveRequest.model.js";
import LeaveType from "./leaveType.model.js";
import LeavePolicy from "./leavePolicy.model.js";
import LeaveBalance from "./leaveBalance.model.js";

import Employee from "../employees/employee.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";

import {
  reserveLeaveBalance,
  consumeReservedLeaveBalance,
  releaseReservedLeaveBalance,
  restoreConsumedLeaveBalance,
} from "./leaveBalance.service.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const normalizeDateOnly = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "Invalid leave date.");
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
};

const getDateKey = (value) =>
  normalizeDateOnly(value).toISOString().slice(0, 10);

const addUtcDays = (date, days) => {
  const result = new Date(date);

  result.setUTCDate(result.getUTCDate() + days);

  return result;
};

const calculateAvailableDays = (balance) =>
  Number(
    (
      Number(balance.allocatedDays || 0) +
      Number(balance.accruedDays || 0) +
      Number(balance.carriedForwardDays || 0) +
      Number(balance.adjustedDays || 0) -
      Number(balance.pendingDays || 0) -
      Number(balance.usedDays || 0) -
      Number(balance.lapsedDays || 0)
    ).toFixed(2),
  );

/**
 * ============================================================
 * EMPLOYEE CONTEXT
 * ============================================================
 */

const resolveRequesterEmployeeContext = async ({
  companyId,
  requesterContext,
  session,
}) => {
  /**
   * Auth context should already identify the employee's
   * company-access record.
   *
   * Do not trust employee/companyAccess IDs from request body.
   */
  if (!requesterContext.companyAccessId) {
    throw new ApiError(
      403,
      "Employee company access is required to apply for leave.",
    );
  }

  const companyAccess = await CompanyAccess.findOne({
    _id: requesterContext.companyAccessId,
    companyId,
    isDeleted: false,
  })
    .session(session)
    .lean();

  if (!companyAccess) {
    throw new ApiError(
      403,
      "Active company access was not found for the requester.",
    );
  }

  const employee = await Employee.findOne({
    companyId,
    companyAccessId: companyAccess._id,
    isDeleted: false,
  })
    .session(session)
    .lean();

  if (!employee) {
    throw new ApiError(
      404,
      "Employee profile was not found for the requester.",
    );
  }

  return {
    employee,
    companyAccess,
  };
};

/**
 * ============================================================
 * LEAVE TYPE
 * ============================================================
 */

const findApplicableLeaveType = async ({
  companyId,
  leaveTypeId,
  fromDate,
  session,
}) => {
  const leaveType = await LeaveType.findOne({
    _id: leaveTypeId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  }).session(session);

  if (!leaveType) {
    throw new ApiError(404, "Active leave type not found.");
  }

  if (
    leaveType.effectiveFrom &&
    normalizeDateOnly(leaveType.effectiveFrom) > normalizeDateOnly(fromDate)
  ) {
    throw new ApiError(
      400,
      "This leave type is not yet effective for the requested date.",
    );
  }

  if (
    leaveType.effectiveTo &&
    normalizeDateOnly(leaveType.effectiveTo) < normalizeDateOnly(fromDate)
  ) {
    throw new ApiError(
      400,
      "This leave type is no longer effective for the requested date.",
    );
  }

  return leaveType;
};

/**
 * ============================================================
 * LEAVE POLICY
 * ============================================================
 */

const findApplicableLeavePolicy = async ({ companyId, fromDate, session }) => {
  const requestDate = normalizeDateOnly(fromDate);

  const policy = await LeavePolicy.findOne({
    companyId,
    isDeleted: false,
    status: "ACTIVE",
    effectiveFrom: {
      $lte: requestDate,
    },
    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: requestDate,
        },
      },
    ],
  })
    .sort({
      isDefault: -1,
      effectiveFrom: -1,
      createdAt: -1,
    })
    .session(session);

  if (!policy) {
    throw new ApiError(
      400,
      "No active leave policy is configured for the requested date.",
    );
  }

  return policy;
};

/**
 * ============================================================
 * DATE DETAILS
 * ============================================================
 *
 * V1:
 * We generate all dates as WORKING_DAY.
 *
 * Weekly-off/public-holiday exclusion will be connected to the
 * company's working-calendar/holiday configuration.
 *
 * We deliberately do not guess weekends because some companies
 * may work Saturdays/Sundays or use different weekly offs.
 */

const buildLeaveDateDetails = ({
  fromDate,
  toDate,
  startDayPortion,
  endDayPortion,
}) => {
  const start = normalizeDateOnly(fromDate);
  const end = normalizeDateOnly(toDate);

  if (end < start) {
    throw new ApiError(
      400,
      "Leave end date cannot be before leave start date.",
    );
  }

  const singleDay = getDateKey(start) === getDateKey(end);

  if (
    !singleDay &&
    (startDayPortion !== "FULL_DAY" || endDayPortion !== "FULL_DAY")
  ) {
    throw new ApiError(
      400,
      "Half-day leave is currently supported only for single-day requests.",
    );
  }

  if (singleDay && startDayPortion !== endDayPortion) {
    throw new ApiError(
      400,
      "Start and end day portions must match for a single-day leave request.",
    );
  }

  const details = [];

  let currentDate = new Date(start);

  while (currentDate <= end) {
    let dayPortion = "FULL_DAY";
    let leaveDays = 1;

    if (singleDay) {
      dayPortion = startDayPortion;

      leaveDays = dayPortion === "FULL_DAY" ? 1 : 0.5;
    }

    details.push({
      date: new Date(currentDate),

      dayPortion,

      dayClassification: "WORKING_DAY",

      leaveDays,

      countedAsLeave: true,

      attendanceId: null,
    });

    currentDate = addUtcDays(currentDate, 1);
  }

  return details;
};

/**
 * ============================================================
 * REQUESTED DAYS
 * ============================================================
 */

const calculateRequestedDays = (dateDetails) =>
  Number(
    dateDetails
      .reduce(
        (total, detail) =>
          total + (detail.countedAsLeave ? Number(detail.leaveDays || 0) : 0),
        0,
      )
      .toFixed(2),
  );

const buildBalanceAllocations = ({ dateDetails, allocationMethod }) => {
  if (allocationMethod !== "MONTHLY_ACCRUAL") {
    return [];
  }

  const allocationsByPeriod = new Map();

  for (const detail of dateDetails) {
    if (detail.countedAsLeave !== true || Number(detail.leaveDays || 0) <= 0) {
      continue;
    }

    const date = new Date(detail.date);

    const periodKey = `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0")}`;

    const currentDays = allocationsByPeriod.get(periodKey) ?? 0;

    allocationsByPeriod.set(
      periodKey,
      Number((currentDays + Number(detail.leaveDays)).toFixed(2)),
    );
  }

  return Array.from(allocationsByPeriod.entries()).map(([periodKey, days]) => ({
    periodKey,
    days,
  }));
};

/**
 * ============================================================
 * POLICY / TYPE RULES
 * ============================================================
 */

const validateLeaveRequestRules = ({
  leaveType,
  leavePolicy,
  companyAccess,
  fromDate,
  requestedDays,
  attachmentUrl,
}) => {
  const today = normalizeDateOnly(new Date());
  const start = normalizeDateOnly(fromDate);

  const differenceMilliseconds = start.getTime() - today.getTime();

  const differenceDays = Math.floor(
    differenceMilliseconds / (24 * 60 * 60 * 1000),
  );

  if (leaveType.allowHalfDay === false && !Number.isInteger(requestedDays)) {
    throw new ApiError(
      400,
      "Half-day leave is not allowed for this leave type.",
    );
  }

  if (
    Number(leaveType.maximumConsecutiveDays || 0) > 0 &&
    requestedDays > Number(leaveType.maximumConsecutiveDays)
  ) {
    throw new ApiError(
      400,
      `This leave type allows a maximum of ${leaveType.maximumConsecutiveDays} consecutive leave days.`,
    );
  }

  if (
    Number(leaveType.minimumNoticeDays || 0) > 0 &&
    differenceDays < Number(leaveType.minimumNoticeDays)
  ) {
    throw new ApiError(
      400,
      `This leave type requires at least ${leaveType.minimumNoticeDays} days of advance notice.`,
    );
  }

  if (differenceDays < 0) {
    if (leaveType.allowBackdatedApplication !== true) {
      throw new ApiError(
        400,
        "Backdated leave applications are not allowed for this leave type.",
      );
    }

    const backdatedDays = Math.abs(differenceDays);

    if (
      Number(leaveType.maximumBackdatedDays || 0) > 0 &&
      backdatedDays > Number(leaveType.maximumBackdatedDays)
    ) {
      throw new ApiError(
        400,
        `Backdated leave cannot exceed ${leaveType.maximumBackdatedDays} days.`,
      );
    }
  }

  if (
    leaveType.requireAttachment === true &&
    Number(leaveType.attachmentRequiredFromDays || 0) > 0 &&
    requestedDays >= Number(leaveType.attachmentRequiredFromDays) &&
    !attachmentUrl
  ) {
    throw new ApiError(
      400,
      "An attachment is required for this leave request.",
    );
  }

  if (
    Number(leavePolicy.maximumFutureApplicationDays || 0) > 0 &&
    differenceDays > Number(leavePolicy.maximumFutureApplicationDays)
  ) {
    throw new ApiError(
      400,
      `Leave cannot be applied more than ${leavePolicy.maximumFutureApplicationDays} days in advance.`,
    );
  }

  /**
   * Minimum service check.
   */
  if (
    Number(leaveType.minimumServiceDays || 0) > 0 &&
    companyAccess.joiningDate
  ) {
    const joiningDate = normalizeDateOnly(companyAccess.joiningDate);

    const serviceDays = Math.floor(
      (start.getTime() - joiningDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (serviceDays < Number(leaveType.minimumServiceDays)) {
      throw new ApiError(
        400,
        `This leave type requires at least ${leaveType.minimumServiceDays} days of service.`,
      );
    }
  }
};

/**
 * ============================================================
 * OVERLAP CHECK
 * ============================================================
 */

const validateNoOverlappingLeave = async ({
  companyId,
  companyAccessId,
  fromDate,
  toDate,
  session,
}) => {
  const overlappingRequest = await LeaveRequest.findOne({
    companyId,
    companyAccessId,

    isDeleted: false,

    status: {
      $in: ["PENDING", "RECOMMENDED", "APPROVED"],
    },

    fromDate: {
      $lte: normalizeDateOnly(toDate),
    },

    toDate: {
      $gte: normalizeDateOnly(fromDate),
    },
  })
    .session(session)
    .select("_id status fromDate toDate")
    .lean();

  if (overlappingRequest) {
    throw new ApiError(
      409,
      "An active leave request already overlaps the requested dates.",
    );
  }
};

/**
 * ============================================================
 * FIND ACTIVE BALANCE
 * ============================================================
 */

const findApplicableLeaveBalance = async ({
  companyId,
  companyAccessId,
  leaveTypeId,
  requestDate,
  session,
}) => {
  const date = normalizeDateOnly(requestDate);

  const balance = await LeaveBalance.findOne({
    companyId,
    companyAccessId,
    leaveTypeId,

    status: "ACTIVE",
    isDeleted: false,

    leaveYearStart: {
      $lte: date,
    },

    leaveYearEnd: {
      $gte: date,
    },
  }).session(session);

  if (!balance) {
    throw new ApiError(
      409,
      "No active leave balance is available for this leave type and leave year.",
    );
  }

  return balance;
};

/**
 * ============================================================
 * CREATE LEAVE REQUEST
 * ============================================================
 */

export const createLeaveRequest = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let createdRequest = null;

  try {
    await session.withTransaction(async () => {
      const fromDate = normalizeDateOnly(data.fromDate);

      const toDate = normalizeDateOnly(data.toDate);

      const { employee, companyAccess } = await resolveRequesterEmployeeContext(
        {
          companyId,
          requesterContext,
          session,
        },
      );

      const [leaveType, leavePolicy] = await Promise.all([
        findApplicableLeaveType({
          companyId,
          leaveTypeId: data.leaveTypeId,
          fromDate,
          session,
        }),

        findApplicableLeavePolicy({
          companyId,
          fromDate,
          session,
        }),
      ]);

      /**
       * The entire request must remain inside the
       * effective period of both the type and policy.
       */
      if (
        leaveType.effectiveTo &&
        normalizeDateOnly(leaveType.effectiveTo) < toDate
      ) {
        throw new ApiError(
          400,
          "The leave request extends beyond the leave type effective period.",
        );
      }

      if (
        leavePolicy.effectiveTo &&
        normalizeDateOnly(leavePolicy.effectiveTo) < toDate
      ) {
        throw new ApiError(
          400,
          "The leave request extends beyond the leave policy effective period.",
        );
      }

      const dateDetails = buildLeaveDateDetails({
        fromDate,
        toDate,

        startDayPortion: data.startDayPortion ?? "FULL_DAY",

        endDayPortion: data.endDayPortion ?? "FULL_DAY",
      });

      const requestedDays = calculateRequestedDays(dateDetails);

      const balanceAllocations = buildBalanceAllocations({
        dateDetails,
        allocationMethod: leaveType.allocationMethod,
      });

      if (requestedDays <= 0) {
        throw new ApiError(
          400,
          "The leave request does not contain any countable leave days.",
        );
      }

      validateLeaveRequestRules({
        leaveType,
        leavePolicy,
        companyAccess,
        fromDate,
        requestedDays,
        attachmentUrl: data.attachmentUrl,
      });

      await validateNoOverlappingLeave({
        companyId,
        companyAccessId: companyAccess._id,
        fromDate,
        toDate,
        session,
      });

      let leaveBalance = null;

      let balanceStatus = "NOT_REQUIRED";

      //   balanceStatus = "PENDING_RESERVATION";

      /**
       * Balance-backed leave.
       */
      if (
        leaveType.requiresBalance === true &&
        leaveType.allocationMethod !== "NO_BALANCE"
      ) {
        balanceStatus = "PENDING_RESERVATION";
        leaveBalance = await findApplicableLeaveBalance({
          companyId,

          companyAccessId: companyAccess._id,

          leaveTypeId: leaveType._id,

          requestDate: fromDate,

          session,
        });

        const availableDays = calculateAvailableDays(leaveBalance);

        if (
          leaveType.allowNegativeBalance !== true &&
          availableDays < requestedDays
        ) {
          throw new ApiError(
            409,
            `Insufficient leave balance. Available: ${availableDays}, requested: ${requestedDays}.`,
          );
        }

        /**
         * Some companies reserve entitlement immediately when
         * the employee submits the request.
         *
         * Others wait until approval before consuming the balance.
         */
        if (leavePolicy.reserveBalanceOnSubmission === true) {
          await reserveLeaveBalance({
            companyId,
            balanceId: leaveBalance._id,
            days: requestedDays,
            allocations: balanceAllocations,
            requesterContext,
            session,
          });

          balanceStatus = "RESERVED";
        }
      }

      const now = new Date();

      const [request] = await LeaveRequest.create(
        [
          {
            companyId,

            employeeId: employee._id,

            companyAccessId: companyAccess._id,

            departmentId: companyAccess.departmentId ?? null,

            teamId: companyAccess.teamId ?? null,

            reportingManagerId: companyAccess.reportingManagerId ?? null,

            leaveTypeId: leaveType._id,

            leavePolicyId: leavePolicy._id,

            leaveBalanceId: leaveBalance?._id ?? null,

            balanceAllocations,

            leaveTypeName: leaveType.name,

            leaveTypeCode: leaveType.code,

            paymentType: leaveType.paymentType,

            fromDate,
            toDate,

            startDayPortion: data.startDayPortion ?? "FULL_DAY",

            endDayPortion: data.endDayPortion ?? "FULL_DAY",

            dateDetails,

            requestedDays,

            reason: data.reason,

            attachmentUrl: data.attachmentUrl ?? "",

            status: "PENDING",

            balanceStatus,

            balanceError: "",

            attendanceApplicationStatus: "NOT_APPLIED",

            payrollAdjustmentRequired: leaveType.paymentType === "UNPAID",

            statusHistory: [
              {
                fromStatus: null,
                toStatus: "PENDING",
                changedBy: requesterContext.userId,
                note: "Leave request submitted.",
                changedAt: now,
              },
            ],

            createdBy: requesterContext.userId,

            updatedBy: requesterContext.userId,
          },
        ],
        {
          session,
        },
      );

      createdRequest = request;
    });

    return createdRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * LIST LEAVE REQUESTS
 * ============================================================
 */

export const listLeaveRequests = async ({
  companyId,
  query,
  scopeFilter = {},
}) => {
  const {
    page = 1,
    limit = 20,

    employeeId,
    companyAccessId,
    departmentId,
    teamId,
    leaveTypeId,

    status,
    cancellationStatus,
    paymentType,

    fromDate,
    toDate,

    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,

    ...scopeFilter,
  };

  if (employeeId) {
    filter.employeeId = employeeId;
  }

  if (companyAccessId) {
    filter.companyAccessId = companyAccessId;
  }

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (teamId) {
    filter.teamId = teamId;
  }

  if (leaveTypeId) {
    filter.leaveTypeId = leaveTypeId;
  }

  if (status) {
    filter.status = status;
  }

  if (cancellationStatus) {
    filter.cancellationStatus = cancellationStatus;
  }

  if (paymentType) {
    filter.paymentType = paymentType;
  }

  /**
   * Requests overlapping the selected date range.
   */
  if (fromDate || toDate) {
    if (toDate) {
      filter.fromDate = {
        $lte: normalizeDateOnly(toDate),
      };
    }

    if (fromDate) {
      filter.toDate = {
        $gte: normalizeDateOnly(fromDate),
      };
    }
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,

    _id: 1,
  };

  const [items, total] = await Promise.all([
    LeaveRequest.find(filter)
      .populate({
        path: "employeeId",

        select: "userId companyAccessId status",

        populate: {
          path: "userId",

          select:
            "firstName middleName lastName displayName email profilePhoto status",
        },
      })

      .populate({
        path: "companyAccessId",

        select:
          "employeeCode designation departmentId teamId roleId reportingManagerId status",

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
      })

      .populate({
        path: "leaveTypeId",

        select: "name code paymentType allocationMethod status",
      })

      .populate({
        path: "leavePolicyId",

        select: "name code status",
      })

      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    LeaveRequest.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

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
 * GET LEAVE REQUEST
 * ============================================================
 */

export const getLeaveRequestById = async ({
  companyId,
  leaveRequestId,
  scopeFilter = {},
}) => {
  const request = await LeaveRequest.findOne({
    _id: leaveRequestId,

    companyId,

    isDeleted: false,

    ...scopeFilter,
  })

    .populate({
      path: "employeeId",

      select: "userId companyAccessId status",

      populate: {
        path: "userId",

        select:
          "firstName middleName lastName displayName email profilePhoto status",
      },
    })

    .populate({
      path: "companyAccessId",

      select:
        "employeeCode designation departmentId teamId roleId reportingManagerId status",

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
    })

    .populate({
      path: "leaveTypeId",

      select: "name code paymentType allocationMethod status",
    })

    .populate({
      path: "leavePolicyId",

      select: "name code status",
    })

    .populate({
      path: "leaveBalanceId",

      select:
        "leaveYearLabel allocationMethod allocatedDays accruedDays carriedForwardDays adjustedDays pendingDays usedDays lapsedDays status",
    })

    .lean();

  if (!request) {
    throw new ApiError(404, "Leave request not found.");
  }

  return request;
};

/**
 * ============================================================
 * WORKFLOW HELPERS
 * ============================================================
 */

const findLeaveRequestForWorkflow = async ({
  companyId,
  leaveRequestId,
  session,
}) => {
  const request = await LeaveRequest.findOne({
    _id: leaveRequestId,
    companyId,
    isDeleted: false,
  }).session(session);

  if (!request) {
    throw new ApiError(404, "Leave request not found.");
  }

  return request;
};

const addStatusHistory = ({
  request,
  fromStatus,
  toStatus,
  userId,
  note = "",
}) => {
  request.statusHistory.push({
    fromStatus,
    toStatus,
    changedBy: userId,
    note: note ?? "",
    changedAt: new Date(),
  });
};

/**
 * Release a balance reservation when a PENDING/RECOMMENDED
 * request is rejected or cancelled.
 */
const releaseRequestBalanceIfRequired = async ({
  companyId,
  request,
  requesterContext,
  session,
}) => {
  if (request.balanceStatus !== "RESERVED" || !request.leaveBalanceId) {
    return;
  }

  await releaseReservedLeaveBalance({
    companyId,
    balanceId: request.leaveBalanceId,
    days: request.requestedDays,
    allocations: request.balanceAllocations ?? [],
    requesterContext,
    session,
  });

  request.balanceStatus = "RELEASED";
  request.balanceError = "";
};

/**
 * ============================================================
 * RECOMMEND LEAVE REQUEST
 * ============================================================
 */

export const recommendLeaveRequest = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      if (request.status !== "PENDING") {
        throw new ApiError(
          409,
          "Only pending leave requests can be recommended.",
        );
      }

      const previousStatus = request.status;
      const now = new Date();

      request.status = "RECOMMENDED";

      request.recommendedBy = requesterContext.userId;

      request.recommendedAt = now;

      request.recommendationNote = data.note ?? "";

      request.updatedBy = requesterContext.userId;

      addStatusHistory({
        request,
        fromStatus: previousStatus,
        toStatus: "RECOMMENDED",
        userId: requesterContext.userId,
        note: data.note || "Leave request recommended.",
      });

      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * APPROVE LEAVE REQUEST
 * ============================================================
 */

export const approveLeaveRequest = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      const policy = await LeavePolicy.findOne({
        _id: request.leavePolicyId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!policy) {
        throw new ApiError(
          404,
          "Leave policy associated with this request was not found.",
        );
      }

      /**
       * Some companies may allow direct approval from PENDING.
       * Others require Team Lead recommendation first.
       */
      if (request.status !== "PENDING" && request.status !== "RECOMMENDED") {
        throw new ApiError(
          409,
          "Only pending or recommended leave requests can be approved.",
        );
      }

      /**
       * If recommendation is configured as mandatory,
       * approval requires RECOMMENDED status.
       *
       * IMPORTANT:
       * Replace `recommendationRequired` below only if your
       * LeavePolicy model uses a different exact field name.
       */
      if (
        policy.approvalWorkflow === "RECOMMEND_THEN_APPROVE" &&
        policy.allowApprovalWithoutRecommendation !== true &&
        request.status !== "RECOMMENDED"
      ) {
        throw new ApiError(
          409,
          "This leave policy requires recommendation before approval.",
        );
      }
      /**
       * Convert reserved balance → consumed.
       */
      /**
       * ============================================================
       * APPLY LEAVE BALANCE ON APPROVAL
       * ============================================================
       *
       * RESERVED:
       * Balance was already reserved when the employee submitted
       * the leave request. Convert the reservation into used leave.
       *
       * PENDING_RESERVATION:
       * The company policy does not reserve balance during
       * submission. Reserve and consume it atomically now.
       *
       * NOT_REQUIRED:
       * No balance operation is needed.
       */

      if (request.leaveBalanceId) {
        if (request.balanceStatus === "RESERVED") {
          await consumeReservedLeaveBalance({
            companyId,
            balanceId: request.leaveBalanceId,
            days: request.requestedDays,
            allocations: request.balanceAllocations ?? [],
            requesterContext,
            session,
          });

          request.balanceStatus = "CONSUMED";
          request.balanceError = "";
        } else if (request.balanceStatus === "PENDING_RESERVATION") {
          /**
           * Revalidate/reserve the balance at approval time.
           *
           * This is important because other approved requests may
           * have consumed the employee's balance after this request
           * was originally submitted.
           */
          await reserveLeaveBalance({
            companyId,
            balanceId: request.leaveBalanceId,
            days: request.requestedDays,
            allocations: request.balanceAllocations ?? [],
            requesterContext,
            session,
          });

          await consumeReservedLeaveBalance({
            companyId,
            balanceId: request.leaveBalanceId,
            days: request.requestedDays,
            allocations: request.balanceAllocations ?? [],
            requesterContext,
            session,
          });

          request.balanceStatus = "CONSUMED";
          request.balanceError = "";
        }
      }

      const previousStatus = request.status;

      const now = new Date();

      request.status = "APPROVED";

      request.approvedBy = requesterContext.userId;

      request.approvedAt = now;

      request.approvalNote = data.note ?? "";

      request.updatedBy = requesterContext.userId;

      /**
       * Attendance integration comes later.
       *
       * Approval does NOT directly fake attendance data here.
       */
      request.attendanceApplicationStatus = "NOT_APPLIED";

      addStatusHistory({
        request,
        fromStatus: previousStatus,
        toStatus: "APPROVED",
        userId: requesterContext.userId,
        note: data.note || "Leave request approved.",
      });

      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * REJECT LEAVE REQUEST
 * ============================================================
 */

export const rejectLeaveRequest = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      if (request.status !== "PENDING" && request.status !== "RECOMMENDED") {
        throw new ApiError(
          409,
          "Only pending or recommended leave requests can be rejected.",
        );
      }

      await releaseRequestBalanceIfRequired({
        companyId,
        request,
        requesterContext,
        session,
      });

      const previousStatus = request.status;

      const now = new Date();

      request.status = "REJECTED";

      request.rejectedBy = requesterContext.userId;

      request.rejectedAt = now;

      request.rejectionReason = data.reason;

      request.updatedBy = requesterContext.userId;

      addStatusHistory({
        request,
        fromStatus: previousStatus,
        toStatus: "REJECTED",
        userId: requesterContext.userId,
        note: data.reason,
      });

      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * CANCEL PENDING / RECOMMENDED REQUEST
 * ============================================================
 */

export const cancelLeaveRequest = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      if (request.status !== "PENDING" && request.status !== "RECOMMENDED") {
        throw new ApiError(
          409,
          "Only pending or recommended leave requests can be cancelled directly.",
        );
      }

      await releaseRequestBalanceIfRequired({
        companyId,
        request,
        requesterContext,
        session,
      });

      const previousStatus = request.status;

      const now = new Date();

      request.status = "CANCELLED";

      request.cancelledBy = requesterContext.userId;

      request.cancelledAt = now;

      request.cancellationReason = data.reason;

      request.updatedBy = requesterContext.userId;

      addStatusHistory({
        request,
        fromStatus: previousStatus,
        toStatus: "CANCELLED",
        userId: requesterContext.userId,
        note: data.reason,
      });

      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * REQUEST CANCELLATION OF APPROVED LEAVE
 * ============================================================
 */

export const requestApprovedLeaveCancellation = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      if (request.status !== "APPROVED") {
        throw new ApiError(
          409,
          "Only approved leave can use the approved-leave cancellation workflow.",
        );
      }

      if (request.cancellationStatus === "PENDING") {
        throw new ApiError(
          409,
          "A cancellation request is already pending for this leave.",
        );
      }

      if (request.cancellationStatus === "APPROVED") {
        throw new ApiError(
          409,
          "This approved leave has already been cancelled.",
        );
      }

      const policy = await LeavePolicy.findOne({
        _id: request.leavePolicyId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!policy) {
        throw new ApiError(
          404,
          "Leave policy associated with this request was not found.",
        );
      }

      if (policy.allowApprovedLeaveCancellation !== true) {
        throw new ApiError(
          409,
          "Cancellation of approved leave is not allowed by the applicable leave policy.",
        );
      }

      request.cancellationStatus = "PENDING";

      request.cancellationRequestedBy = requesterContext.userId;

      request.cancellationRequestedAt = new Date();

      request.cancellationRequestReason = data.reason;

      request.cancellationReviewedBy = null;

      request.cancellationReviewedAt = null;

      request.cancellationReviewNote = "";

      request.updatedBy = requesterContext.userId;

      /**
       * Main status remains APPROVED until the
       * cancellation itself is approved.
       */
      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * APPROVE APPROVED-LEAVE CANCELLATION
 * ============================================================
 */

export const approveLeaveCancellation = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      if (request.status !== "APPROVED") {
        throw new ApiError(
          409,
          "Only approved leave can have its cancellation approved.",
        );
      }

      if (request.cancellationStatus !== "PENDING") {
        throw new ApiError(
          409,
          "Only pending approved-leave cancellation requests can be approved.",
        );
      }

      /**
       * Restore consumed balance.
       */
      if (request.balanceStatus === "CONSUMED" && request.leaveBalanceId) {
        await restoreConsumedLeaveBalance({
          companyId,
          balanceId: request.leaveBalanceId,
          days: request.requestedDays,
          allocations: request.balanceAllocations ?? [],
          requesterContext,
          session,
        });

        request.balanceStatus = "RELEASED";

        request.balanceError = "";
      }

      const previousStatus = request.status;

      const now = new Date();

      request.cancellationStatus = "APPROVED";

      request.cancellationReviewedBy = requesterContext.userId;

      request.cancellationReviewedAt = now;

      request.cancellationReviewNote = data.note ?? "";

      /**
       * Approved cancellation makes the leave itself
       * CANCELLED.
       */
      request.status = "CANCELLED";

      request.cancelledBy = requesterContext.userId;

      request.cancelledAt = now;

      request.cancellationReason = request.cancellationRequestReason;

      request.updatedBy = requesterContext.userId;

      /**
       * If attendance was previously applied, we do not
       * silently modify it here.
       *
       * Attendance reversal integration will handle it.
       */
      if (request.attendanceApplicationStatus === "APPLIED") {
        request.attendanceApplicationStatus = "NOT_APPLIED";
      }

      addStatusHistory({
        request,
        fromStatus: previousStatus,
        toStatus: "CANCELLED",
        userId: requesterContext.userId,
        note:
          data.note ||
          request.cancellationRequestReason ||
          "Approved leave cancellation approved.",
      });

      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * REJECT APPROVED-LEAVE CANCELLATION
 * ============================================================
 */

export const rejectLeaveCancellation = async ({
  companyId,
  leaveRequestId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedRequest = null;

  try {
    await session.withTransaction(async () => {
      const request = await findLeaveRequestForWorkflow({
        companyId,
        leaveRequestId,
        session,
      });

      if (request.status !== "APPROVED") {
        throw new ApiError(
          409,
          "Only approved leave can have its cancellation reviewed.",
        );
      }

      if (request.cancellationStatus !== "PENDING") {
        throw new ApiError(
          409,
          "Only pending approved-leave cancellation requests can be rejected.",
        );
      }

      request.cancellationStatus = "REJECTED";

      request.cancellationReviewedBy = requesterContext.userId;

      request.cancellationReviewedAt = new Date();

      request.cancellationReviewNote = data.note ?? "";

      request.updatedBy = requesterContext.userId;

      /**
       * Main leave remains APPROVED.
       *
       * Balance remains CONSUMED.
       * Attendance remains untouched.
       */
      await request.save({
        session,
      });

      updatedRequest = request;
    });

    return updatedRequest;
  } finally {
    await session.endSession();
  }
};
