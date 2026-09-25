import mongoose from "mongoose";

import LeaveRequest from "./leaveRequest.model.js";
import LeaveType from "./leaveType.model.js";
import LeavePolicy from "./leavePolicy.model.js";
import LeaveBalance from "./leaveBalance.model.js";

import Employee from "../employees/employee.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";

import {
  createLeaveBalance,
  reserveLeaveBalance,
  consumeReservedLeaveBalance,
  releaseReservedLeaveBalance,
  restoreConsumedLeaveBalance,
} from "./leaveBalance.service.js";

import {
  buildLeaveRequestReadFilter,
  canAccessLeaveCompanyAccess,
  canManageLeaveCompanyAccess,
} from "./leave.scope.js";

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
 * Find the company's active unpaid leave type that can be used
 * as the automatic Loss of Pay fallback.
 *
 * We intentionally identify it by payment semantics rather than
 * hardcoding a code such as "LOP", because companies may name
 * unpaid leave differently (LOP, LWP, Unpaid Leave, etc.).
 */
const findApplicableUnpaidLeaveType = async ({
  companyId,
  fromDate,
  toDate,
  session,
}) => {
  const start = normalizeDateOnly(fromDate);
  const end = normalizeDateOnly(toDate);

  const unpaidLeaveTypes = await LeaveType.find({
    companyId,
    isDeleted: false,
    status: "ACTIVE",

    paymentType: "UNPAID",
    requiresBalance: false,
    allocationMethod: "NO_BALANCE",

    effectiveFrom: {
      $lte: start,
    },

    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: end,
        },
      },
    ],
  })
    .sort({
      effectiveFrom: -1,
      createdAt: -1,
    })
    .session(session);

  if (unpaidLeaveTypes.length === 0) {
    return null;
  }

  if (unpaidLeaveTypes.length > 1) {
    throw new ApiError(
      409,
      "Multiple active unpaid leave types are configured for automatic unpaid overflow. Please keep only one applicable unpaid no-balance leave type active.",
    );
  }

  return unpaidLeaveTypes[0];
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
 * PAID / UNPAID LEAVE ALLOCATION
 * ============================================================
 */

/**
 * Return the YYYY-MM bucket for a leave date.
 */
const getPeriodKey = (value) => {
  const date = normalizeDateOnly(value);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
};

/**
 * Calculate how much paid entitlement is actually usable for
 * each requested period.
 *
 * IMPORTANT:
 * This does not consume or reserve anything.
 * It only calculates the maximum amount that may be allocated
 * as paid leave.
 */
const calculateUsablePaidAllocations = ({
  leaveType,
  leaveBalance,
  dateDetails,
}) => {
  /**
   * Unpaid/no-balance leave does not consume paid entitlement.
   */
  if (
    leaveType.paymentType !== "PAID" ||
    leaveType.requiresBalance !== true ||
    leaveType.allocationMethod === "NO_BALANCE" ||
    !leaveBalance
  ) {
    return [];
  }

  const requestedByPeriod = new Map();

  for (const detail of dateDetails) {
    if (detail.countedAsLeave !== true || Number(detail.leaveDays || 0) <= 0) {
      continue;
    }

    const periodKey =
      leaveType.allocationMethod === "MONTHLY_ACCRUAL"
        ? getPeriodKey(detail.date)
        : null;

    const current = requestedByPeriod.get(periodKey) ?? 0;

    requestedByPeriod.set(
      periodKey,
      Number((current + Number(detail.leaveDays)).toFixed(2)),
    );
  }

  let remainingAggregateAvailable = Math.max(
    0,
    calculateAvailableDays(leaveBalance),
  );

  /**
   * maximumConsecutiveDays limits how much of this request
   * may be covered by the selected paid leave type.
   *
   * The remaining requested days are allowed to continue
   * as unpaid leave (LOP) instead of rejecting the request.
   */
  if (Number(leaveType.maximumConsecutiveDays || 0) > 0) {
    remainingAggregateAvailable = Math.min(
      remainingAggregateAvailable,
      Number(leaveType.maximumConsecutiveDays),
    );
  }

  const allocations = [];

  for (const [periodKey, requestedDays] of requestedByPeriod.entries()) {
    if (remainingAggregateAvailable <= 0) {
      break;
    }

    let usableDays = Math.min(requestedDays, remainingAggregateAvailable);

    /**
     * MONTHLY_ACCRUAL must additionally respect:
     *
     * - the month's credited/adjusted balance
     * - already pending leave
     * - already used leave
     * - lapsed leave
     * - maximum monthly usage
     */
    if (leaveType.allocationMethod === "MONTHLY_ACCRUAL") {
      const monthlyBalance = leaveBalance.monthlyBalances?.find(
        (item) => item.periodKey === periodKey,
      );

      /**
       * No credited bucket for the requested month means there
       * is currently no usable paid entitlement for that month.
       *
       * Future/projected entitlement can be handled separately
       * when we implement future-month accrual.
       */
      if (!monthlyBalance) {
        continue;
      }

      const monthlyAvailable = Math.max(
        0,
        Number(
          (
            Number(monthlyBalance.creditedDays || 0) +
            Number(monthlyBalance.adjustedDays || 0) -
            Number(monthlyBalance.pendingDays || 0) -
            Number(monthlyBalance.usedDays || 0) -
            Number(monthlyBalance.lapsedDays || 0)
          ).toFixed(2),
        ),
      );

      usableDays = Math.min(usableDays, monthlyAvailable);

      if (leaveType.maximumMonthlyUsageDays != null) {
        const alreadyCommitted =
          Number(monthlyBalance.usedDays || 0) +
          Number(monthlyBalance.pendingDays || 0);

        const remainingMonthlyUsage = Math.max(
          0,
          Number(leaveType.maximumMonthlyUsageDays) - alreadyCommitted,
        );

        usableDays = Math.min(usableDays, remainingMonthlyUsage);
      }
    }

    usableDays = Number(Math.max(0, usableDays).toFixed(2));

    if (usableDays <= 0) {
      continue;
    }

    allocations.push({
      periodKey,
      days: usableDays,
    });

    remainingAggregateAvailable = Number(
      (remainingAggregateAvailable - usableDays).toFixed(2),
    );
  }

  return allocations;
};

/**
 * Apply paid/unpaid allocation to each individual leave date.
 *
 * MONTHLY_ACCRUAL:
 * - A month's paid entitlement may only cover dates in that same month.
 *
 * ANNUAL_UPFRONT / MANUAL:
 * - Paid entitlement is applied chronologically across the request.
 *
 * A single full date may be split, for example:
 * 0.5 paid + 0.5 unpaid.
 */
const applyPaidUnpaidAllocationToDates = ({
  dateDetails,
  balanceAllocations,
  selectedLeaveType,
  unpaidLeaveType,
}) => {
  const isMonthlyAllocation =
    selectedLeaveType.paymentType === "PAID" &&
    selectedLeaveType.requiresBalance === true &&
    selectedLeaveType.allocationMethod === "MONTHLY_ACCRUAL";

  /**
   * Remaining paid entitlement keyed by period.
   *
   * MONTHLY_ACCRUAL:
   *   "2026-09" => 1
   *   "2026-10" => 0.5
   *
   * Annual/manual:
   *   null => total usable paid entitlement
   */
  const remainingPaidByPeriod = new Map();

  for (const allocation of balanceAllocations ?? []) {
    const key = isMonthlyAllocation ? allocation.periodKey : null;

    const current = remainingPaidByPeriod.get(key) ?? 0;

    remainingPaidByPeriod.set(
      key,
      Number((current + Number(allocation.days || 0)).toFixed(2)),
    );
  }

  return dateDetails.map((detail) => {
    const leaveDays = Number(detail.leaveDays || 0);

    /**
     * Weekly offs / holidays that are not counted as leave
     * receive no financial allocation.
     */
    if (detail.countedAsLeave !== true || leaveDays <= 0) {
      return {
        ...detail,

        allocationType: "NOT_APPLICABLE",

        paidDays: 0,
        unpaidDays: 0,

        paidLeaveTypeId: null,
        paidLeaveTypeName: "",
        paidLeaveTypeCode: "",

        unpaidLeaveTypeId: null,
        unpaidLeaveTypeName: "",
        unpaidLeaveTypeCode: "",
      };
    }

    /**
     * Directly selected unpaid leave.
     */
    if (selectedLeaveType.paymentType === "UNPAID") {
      return {
        ...detail,

        allocationType: "UNPAID",

        paidDays: 0,
        unpaidDays: leaveDays,

        paidLeaveTypeId: null,
        paidLeaveTypeName: "",
        paidLeaveTypeCode: "",

        unpaidLeaveTypeId: selectedLeaveType._id,
        unpaidLeaveTypeName: selectedLeaveType.name,
        unpaidLeaveTypeCode: selectedLeaveType.code,
      };
    }

    /**
     * Paid leave type that does not require a balance.
     *
     * The entire date is paid.
     */
    if (
      selectedLeaveType.paymentType === "PAID" &&
      (selectedLeaveType.requiresBalance !== true ||
        selectedLeaveType.allocationMethod === "NO_BALANCE")
    ) {
      return {
        ...detail,

        allocationType: "PAID",

        paidDays: leaveDays,
        unpaidDays: 0,

        paidLeaveTypeId: selectedLeaveType._id,
        paidLeaveTypeName: selectedLeaveType.name,
        paidLeaveTypeCode: selectedLeaveType.code,

        unpaidLeaveTypeId: null,
        unpaidLeaveTypeName: "",
        unpaidLeaveTypeCode: "",
      };
    }

    /**
     * Balance-backed paid leave.
     *
     * Monthly accrual must use only the entitlement belonging
     * to this date's own month.
     *
     * Annual/manual allocation uses the shared null bucket.
     */
    const allocationKey = isMonthlyAllocation
      ? getPeriodKey(detail.date)
      : null;

    const remainingPaid = Number(remainingPaidByPeriod.get(allocationKey) ?? 0);

    const paidForDate = Number(Math.min(leaveDays, remainingPaid).toFixed(2));

    const unpaidForDate = Number(
      Math.max(0, leaveDays - paidForDate).toFixed(2),
    );

    remainingPaidByPeriod.set(
      allocationKey,
      Number(Math.max(0, remainingPaid - paidForDate).toFixed(2)),
    );

    let allocationType = "UNPAID";

    if (paidForDate > 0 && unpaidForDate > 0) {
      allocationType = "MIXED";
    } else if (paidForDate > 0) {
      allocationType = "PAID";
    }

    return {
      ...detail,

      allocationType,

      paidDays: paidForDate,
      unpaidDays: unpaidForDate,

      paidLeaveTypeId: paidForDate > 0 ? selectedLeaveType._id : null,

      paidLeaveTypeName: paidForDate > 0 ? selectedLeaveType.name : "",

      paidLeaveTypeCode: paidForDate > 0 ? selectedLeaveType.code : "",

      unpaidLeaveTypeId:
        unpaidForDate > 0 ? (unpaidLeaveType?._id ?? null) : null,

      unpaidLeaveTypeName:
        unpaidForDate > 0 ? (unpaidLeaveType?.name ?? "") : "",

      unpaidLeaveTypeCode:
        unpaidForDate > 0 ? (unpaidLeaveType?.code ?? "") : "",
    };
  });
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

const findOrCreateApplicableLeaveBalance = async ({
  companyId,
  employeeId,
  companyAccessId,
  leaveType,
  leavePolicy,
  requestDate,
  requesterContext,
  session,
}) => {
  const date = normalizeDateOnly(requestDate);

  const { leaveYearStart, leaveYearEnd, leaveYearLabel } = resolveLeaveYear({
    requestDate: date,
    leavePolicy,
  });

  let balance = await LeaveBalance.findOne({
    companyId,
    companyAccessId,
    leaveTypeId: leaveType._id,

    status: "ACTIVE",
    isDeleted: false,

    leaveYearStart: {
      $lte: date,
    },

    leaveYearEnd: {
      $gte: date,
    },
  }).session(session);

  if (balance) {
    return balance;
  }

  /**
   * Company policy may require balances to be created
   * beforehand by an administrator or initialization job.
   */
  if (leavePolicy.autoCreateLeaveBalances !== true) {
    throw new ApiError(
      409,
      "No active leave balance is available for this leave type and leave year.",
    );
  }

  /**
   * Automatically initialize the employee's balance using
   * the existing balance-domain service.
   */
  balance = await createLeaveBalance({
    companyId,

    employeeId,

    leaveTypeId: leaveType._id,

    leavePolicyId: leavePolicy._id,

    leaveYearStart,
    leaveYearEnd,
    leaveYearLabel,

    carriedForwardDays: 0,

    requesterContext,

    session,
  });

  return balance;
};

const resolveLeaveYear = ({ requestDate, leavePolicy }) => {
  const date = normalizeDateOnly(requestDate);

  const startMonth = Number(leavePolicy.leaveYearStartMonth) - 1;

  const startDay = Number(leavePolicy.leaveYearStartDay);

  let startYear = date.getUTCFullYear();

  const candidateStart = new Date(Date.UTC(startYear, startMonth, startDay));

  if (date < candidateStart) {
    startYear -= 1;
  }

  const leaveYearStart = new Date(Date.UTC(startYear, startMonth, startDay));

  const nextLeaveYearStart = new Date(
    Date.UTC(startYear + 1, startMonth, startDay),
  );

  const leaveYearEnd = new Date(
    nextLeaveYearStart.getTime() - 24 * 60 * 60 * 1000,
  );

  const leaveYearLabel =
    leaveYearStart.getUTCFullYear() === leaveYearEnd.getUTCFullYear()
      ? `${leaveYearStart.getUTCFullYear()}`
      : `${leaveYearStart.getUTCFullYear()}-${leaveYearEnd.getUTCFullYear()}`;

  return {
    leaveYearStart,
    leaveYearEnd,
    leaveYearLabel,
  };
};

const validateRequestWithinSingleLeaveYear = ({
  fromDate,
  toDate,
  leavePolicy,
}) => {
  const fromLeaveYear = resolveLeaveYear({
    requestDate: fromDate,
    leavePolicy,
  });

  const toLeaveYear = resolveLeaveYear({
    requestDate: toDate,
    leavePolicy,
  });

  if (
    getDateKey(fromLeaveYear.leaveYearStart) !==
    getDateKey(toLeaveYear.leaveYearStart)
  ) {
    throw new ApiError(
      400,
      "A leave request cannot span multiple leave years. Please submit separate leave requests for each leave year.",
    );
  }
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

      /**
       * A single leave request must belong to one leave year.
       */
      validateRequestWithinSingleLeaveYear({
        fromDate,
        toDate,
        leavePolicy,
      });

      let dateDetails = buildLeaveDateDetails({
        fromDate,
        toDate,

        startDayPortion: data.startDayPortion ?? "FULL_DAY",

        endDayPortion: data.endDayPortion ?? "FULL_DAY",
      });

      const requestedDays = calculateRequestedDays(dateDetails);

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

      /**
       * Prevent overlapping active leave requests only when
       * enabled by the applicable company leave policy.
       */
      if (leavePolicy.preventOverlappingRequests === true) {
        await validateNoOverlappingLeave({
          companyId,
          companyAccessId: companyAccess._id,
          fromDate,
          toDate,
          session,
        });
      }

      let leaveBalance = null;
      let balanceStatus = "NOT_REQUIRED";

      let balanceAllocations = [];

      let paidDays = 0;
      let unpaidDays = 0;

      let unpaidLeaveType = null;

      /**
       * ============================================================
       * CALCULATE PAID / UNPAID ALLOCATION
       * ============================================================
       */

      /**
       * Employee directly selected an unpaid leave type.
       *
       * The complete request is unpaid and no paid leave balance
       * is involved.
       */
      if (leaveType.paymentType === "UNPAID") {
        paidDays = 0;
        unpaidDays = requestedDays;

        unpaidLeaveType = leaveType;
      } else {
        /**
         * Selected leave type is paid.
         *
         * If the leave type uses entitlement/balance, determine how
         * much of the request can actually be covered by that
         * entitlement.
         */
        if (
          leaveType.requiresBalance === true &&
          leaveType.allocationMethod !== "NO_BALANCE"
        ) {
          leaveBalance = await findOrCreateApplicableLeaveBalance({
            companyId,

            employeeId: employee._id,

            companyAccessId: companyAccess._id,

            leaveType,

            leavePolicy,

            requestDate: fromDate,

            requesterContext,

            session,
          });

          balanceAllocations = calculateUsablePaidAllocations({
            leaveType,
            leaveBalance,
            dateDetails,
          });

          paidDays = Number(
            balanceAllocations
              .reduce(
                (total, allocation) => total + Number(allocation.days || 0),
                0,
              )
              .toFixed(2),
          );
        } else {
          /**
           * A PAID leave type that does not require a balance is
           * considered fully paid.
           */
          paidDays = requestedDays;
        }

        unpaidDays = Number(Math.max(0, requestedDays - paidDays).toFixed(2));

        /**
         * If paid entitlement cannot cover the complete request,
         * resolve the company's configured unpaid leave type.
         */
        if (unpaidDays > 0) {
          unpaidLeaveType = await findApplicableUnpaidLeaveType({
            companyId,
            fromDate,
            toDate,
            session,
          });

          if (!unpaidLeaveType) {
            throw new ApiError(
              409,
              "The selected paid leave entitlement cannot cover the full request, and no active unpaid leave type is configured for the remaining days.",
            );
          }
        }
      }

      /**
       * Store the actual financial allocation against each date.
       */
      dateDetails = applyPaidUnpaidAllocationToDates({
        dateDetails,
        balanceAllocations,
        selectedLeaveType: leaveType,
        unpaidLeaveType,
      });

      /**
       * ============================================================
       * RESERVE ONLY THE PAID ENTITLEMENT
       * ============================================================
       */

      if (leaveBalance && paidDays > 0) {
        balanceStatus = "PENDING_RESERVATION";

        if (leavePolicy.reserveBalanceOnSubmission === true) {
          await reserveLeaveBalance({
            companyId,
            balanceId: leaveBalance._id,
            days: paidDays,
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

            paidDays,

            unpaidDays,

            reason: data.reason,

            attachmentUrl: data.attachmentUrl ?? "",

            status: "PENDING",

            balanceStatus,

            balanceError: "",

            attendanceApplicationStatus: "NOT_APPLIED",

            // payrollAdjustmentRequired: leaveType.paymentType === "UNPAID",
            payrollAdjustmentRequired: unpaidDays > 0,

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
  requesterContext,
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

  const scopeFilter = await buildLeaveRequestReadFilter({
    requesterContext,
    companyId,
  });

  const userFilter = {};

  if (employeeId) {
    userFilter.employeeId = employeeId;
  }

  if (companyAccessId) {
    userFilter.companyAccessId = companyAccessId;
  }

  if (departmentId) {
    userFilter.departmentId = departmentId;
  }

  if (teamId) {
    userFilter.teamId = teamId;
  }

  if (leaveTypeId) {
    userFilter.leaveTypeId = leaveTypeId;
  }

  if (status) {
    userFilter.status = status;
  }

  if (cancellationStatus) {
    userFilter.cancellationStatus = cancellationStatus;
  }

  if (paymentType) {
    userFilter.paymentType = paymentType;
  }

  /**
   * Requests overlapping the selected date range.
   */
  if (fromDate || toDate) {
    if (toDate) {
      userFilter.fromDate = {
        $lte: normalizeDateOnly(toDate),
      };
    }

    if (fromDate) {
      userFilter.toDate = {
        $gte: normalizeDateOnly(fromDate),
      };
    }
  }

  const filter =
    Object.keys(userFilter).length > 0
      ? {
          $and: [scopeFilter, userFilter],
        }
      : scopeFilter;

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

        select:
          "name code status approvalWorkflow allowApprovalWithoutRecommendation",
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
  requesterContext,
}) => {
  const request = await LeaveRequest.findOne({
    _id: leaveRequestId,
    companyId,
    isDeleted: false,
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
      select:
        "name code status approvalWorkflow allowApprovalWithoutRecommendation",
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

  /**
   * SECURITY:
   * Verify that the authenticated requester may access
   * the employee who owns this leave request.
   */
  const allowed = await canAccessLeaveCompanyAccess({
    requesterContext,
    companyId,
    targetCompanyAccessId:
      request.companyAccessId?._id || request.companyAccessId,
  });

  if (!allowed) {
    throw new ApiError(
      403,
      "You are not allowed to access this leave request.",
    );
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
    days: request.paidDays,
    allocations: request.balanceAllocations ?? [],
    requesterContext,
    session,
  });

  request.balanceStatus = "RELEASED";
  request.balanceError = "";
};

const finalizeApprovedLeaveCancellation = async ({
  companyId,
  request,
  requesterContext,
  session,
  reviewNote = "",
}) => {
  /**
   * Restore consumed leave balance when applicable.
   */
  if (request.balanceStatus === "CONSUMED" && request.leaveBalanceId) {
    await restoreConsumedLeaveBalance({
      companyId,
      balanceId: request.leaveBalanceId,
      days: request.paidDays,
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
  request.cancellationReviewNote = reviewNote ?? "";

  request.status = "CANCELLED";

  request.cancelledBy = requesterContext.userId;
  request.cancelledAt = now;
  request.cancellationReason = request.cancellationRequestReason;

  request.updatedBy = requesterContext.userId;

  addStatusHistory({
    request,
    fromStatus: previousStatus,
    toStatus: "CANCELLED",
    userId: requesterContext.userId,
    note:
      reviewNote ||
      request.cancellationRequestReason ||
      "Approved leave cancelled.",
  });
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

      /**
       * SECURITY:
       *
       * Recommendation is a managerial action.
       *
       * COMPANY scope:
       *   Can manage employees in the company.
       *
       * TEAM scope:
       *   Can manage employees belonging to teams actually managed
       *   by the requester.
       *
       * SELF:
       *   Not allowed. A Team Lead must not recommend their own leave.
       *
       * Route-level permission checks remain separate.
       */
      const canManage = await canManageLeaveCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: request.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!canManage) {
        throw new ApiError(
          403,
          "You are not allowed to recommend this leave request.",
        );
      }

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

      /**
       * SECURITY:
       * Approval is a managerial action.
       * The requester must be allowed to manage the employee
       * who owns this leave request.
       *
       * Self-approval is intentionally blocked.
       */
      const canManage = await canManageLeaveCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: request.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!canManage) {
        throw new ApiError(
          403,
          "You are not allowed to approve this leave request.",
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
            days: request.paidDays,
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
            days: request.paidDays,
            allocations: request.balanceAllocations ?? [],
            requesterContext,
            session,
          });

          await consumeReservedLeaveBalance({
            companyId,
            balanceId: request.leaveBalanceId,
            days: request.paidDays,
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

      /**
       * SECURITY:
       * Rejection is a managerial action.
       *
       * Self-rejection is intentionally blocked.
       */
      const canManage = await canManageLeaveCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: request.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!canManage) {
        throw new ApiError(
          403,
          "You are not allowed to reject this leave request.",
        );
      }

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

      /**
       * SECURITY:
       * Direct cancellation is a self-service employee action.
       * An employee may cancel only their own leave request.
       */
      const isOwnRequest =
        String(request.companyAccessId) ===
        String(requesterContext.companyAccessId);

      if (!isOwnRequest) {
        throw new ApiError(
          403,
          "You are not allowed to cancel this leave request.",
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

      if (
        request.status === "PENDING" &&
        policy.allowEmployeeCancelPending !== true
      ) {
        throw new ApiError(
          409,
          "Cancellation of pending leave requests is not allowed by the applicable leave policy.",
        );
      }

      if (
        request.status === "RECOMMENDED" &&
        policy.allowEmployeeCancelRecommended !== true
      ) {
        throw new ApiError(
          409,
          "Cancellation of recommended leave requests is not allowed by the applicable leave policy.",
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

      /**
       * SECURITY:
       * Requesting cancellation of approved leave is a
       * self-service employee action.
       *
       * Employees may request cancellation only for
       * their own approved leave.
       */
      const isOwnRequest =
        String(request.companyAccessId) ===
        String(requesterContext.companyAccessId);

      if (!isOwnRequest) {
        throw new ApiError(
          403,
          "You are not allowed to request cancellation of this leave.",
        );
      }

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

      const now = new Date();

      request.cancellationRequestedBy = requesterContext.userId;
      request.cancellationRequestedAt = now;
      request.cancellationRequestReason = data.reason;

      request.cancellationReviewedBy = null;
      request.cancellationReviewedAt = null;
      request.cancellationReviewNote = "";

      request.updatedBy = requesterContext.userId;

      /**
       * If company policy requires managerial approval,
       * keep the leave APPROVED and create a pending
       * cancellation request.
       */
      if (policy.approvedCancellationRequiresApproval === true) {
        request.cancellationStatus = "PENDING";
      } else {
        /**
         * No cancellation approval is required.
         *
         * Finalize the cancellation immediately.
         * The helper restores consumed leave balance
         * and changes the leave itself to CANCELLED.
         */
        await finalizeApprovedLeaveCancellation({
          companyId,
          request,
          requesterContext,
          session,
          reviewNote:
            "Approved leave cancelled automatically as per leave policy.",
        });
      }

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

      /**
       * SECURITY:
       * Reviewing an approved-leave cancellation is a managerial action.
       * Self-review is intentionally blocked.
       */
      const canManage = await canManageLeaveCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: request.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!canManage) {
        throw new ApiError(
          403,
          "You are not allowed to approve cancellation of this leave request.",
        );
      }

      /**
       * The original leave itself must still be APPROVED.
       */
      if (request.status !== "APPROVED") {
        throw new ApiError(
          409,
          "Only approved leave can have its cancellation approved.",
        );
      }

      /**
       * There must be an active cancellation request waiting
       * for managerial approval.
       */
      if (request.cancellationStatus !== "PENDING") {
        throw new ApiError(
          409,
          "Only pending approved-leave cancellation requests can be approved.",
        );
      }

      /**
       * Finalize the approved cancellation.
       *
       * This helper:
       * - restores consumed leave balance when required
       * - marks cancellation as APPROVED
       * - changes the leave status to CANCELLED
       * - stores cancellation review information
       * - writes status history
       *
       * Attendance is deliberately NOT changed here.
       * Actual attendance reversal will be integrated separately.
       */
      await finalizeApprovedLeaveCancellation({
        companyId,
        request,
        requesterContext,
        session,
        reviewNote: data.note ?? "",
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

      /**
       * SECURITY:
       * Rejecting an approved-leave cancellation is a managerial action.
       * Self-review is intentionally blocked.
       */
      const canManage = await canManageLeaveCompanyAccess({
        requesterContext,
        companyId,
        targetCompanyAccessId: request.companyAccessId,
        allowSelf: false,
        session,
      });

      if (!canManage) {
        throw new ApiError(
          403,
          "You are not allowed to reject cancellation of this leave request.",
        );
      }

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
