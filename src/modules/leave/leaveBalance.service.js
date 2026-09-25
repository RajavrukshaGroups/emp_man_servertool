import mongoose from "mongoose";

import LeaveBalance from "./leaveBalance.model.js";
import LeaveType from "./leaveType.model.js";
import LeavePolicy from "./leavePolicy.model.js";
import Employee from "../employees/employee.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const roundToHalfDay = (value) => Math.round(Number(value) * 2) / 2;

const getPeriodKey = (date) => {
  const value = new Date(date);

  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
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
 * Find balance or fail.
 */
const findLeaveBalanceOrFail = async (
  companyId,
  balanceId,
  { session = null, lean = false } = {},
) => {
  let query = LeaveBalance.findOne({
    _id: balanceId,
    companyId,
    isDeleted: false,
  });

  if (session) {
    query = query.session(session);
  }

  if (lean) {
    query = query.lean({
      virtuals: true,
    });
  }

  const balance = await query;

  if (!balance) {
    throw new ApiError(404, "Leave balance not found.");
  }

  return balance;
};

/**
 * Resolve employee and active company access.
 */
const resolveEmployeeContext = async ({
  companyId,
  employeeId,
  session = null,
}) => {
  let employeeQuery = Employee.findOne({
    _id: employeeId,
    companyId,
    isDeleted: false,
  }).select("_id companyId companyAccessId status");

  if (session) {
    employeeQuery = employeeQuery.session(session);
  }

  const employee = await employeeQuery.lean();

  if (!employee) {
    throw new ApiError(404, "Employee not found in the selected company.");
  }

  let accessQuery = CompanyAccess.findOne({
    _id: employee.companyAccessId,
    companyId,
    isDeleted: false,
  }).select(
    "_id companyId employeeCode departmentId teamId roleId joiningDate status",
  );

  if (session) {
    accessQuery = accessQuery.session(session);
  }

  const companyAccess = await accessQuery.lean();

  if (!companyAccess) {
    throw new ApiError(
      404,
      "Company access record not found for the employee.",
    );
  }

  return {
    employee,
    companyAccess,
  };
};

/**
 * Find active leave type.
 */
const findActiveLeaveType = async ({
  companyId,
  leaveTypeId,
  session = null,
}) => {
  let query = LeaveType.findOne({
    _id: leaveTypeId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  });

  if (session) {
    query = query.session(session);
  }

  const leaveType = await query;

  if (!leaveType) {
    throw new ApiError(404, "Active leave type not found.");
  }

  return leaveType;
};

/**
 * Find active leave policy.
 */
const findActiveLeavePolicy = async ({
  companyId,
  leavePolicyId,
  session = null,
}) => {
  let query = LeavePolicy.findOne({
    _id: leavePolicyId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  });

  if (session) {
    query = query.session(session);
  }

  const policy = await query;

  if (!policy) {
    throw new ApiError(404, "Active leave policy not found.");
  }

  return policy;
};

/**
 * ============================================================
 * CREATE / INITIALIZE BALANCE
 * ============================================================
 *
 * Internal service operation.
 *
 * This should NOT become an unrestricted public CRUD endpoint.
 */
export const createLeaveBalance = async ({
  companyId,
  employeeId,
  leaveTypeId,
  leavePolicyId,
  leaveYearStart,
  leaveYearEnd,
  leaveYearLabel,
  carriedForwardDays = 0,
  requesterContext,
  session = null,
}) => {
  const [{ employee, companyAccess }, leaveType, leavePolicy] =
    await Promise.all([
      resolveEmployeeContext({
        companyId,
        employeeId,
        session,
      }),

      findActiveLeaveType({
        companyId,
        leaveTypeId,
        session,
      }),

      findActiveLeavePolicy({
        companyId,
        leavePolicyId,
        session,
      }),
    ]);

  if (leaveType.allocationMethod === "NO_BALANCE") {
    throw new ApiError(
      400,
      "A leave balance must not be created for a no-balance leave type.",
    );
  }

  const start = new Date(leaveYearStart);
  const end = new Date(leaveYearEnd);

  if (
    new Date(leavePolicy.effectiveFrom) > start ||
    (leavePolicy.effectiveTo && new Date(leavePolicy.effectiveTo) < start)
  ) {
    throw new ApiError(
      400,
      "The selected leave policy is not effective for this leave year.",
    );
  }

  if (end < start) {
    throw new ApiError(
      400,
      "Leave year end cannot be before leave year start.",
    );
  }

  let existingBalanceQuery = LeaveBalance.findOne({
    companyId,
    companyAccessId: companyAccess._id,
    leaveTypeId,
    leaveYearStart: start,
    isDeleted: false,
  }).select("_id");

  if (session) {
    existingBalanceQuery = existingBalanceQuery.session(session);
  }

  const existingBalance = await existingBalanceQuery;

  if (existingBalance) {
    throw new ApiError(
      409,
      "A leave balance already exists for this employee, leave type and leave year.",
    );
  }

  let allocatedDays = 0;

  if (leaveType.allocationMethod === "ANNUAL_UPFRONT") {
    allocatedDays = Number(leaveType.annualEntitlementDays || 0);
  }

  if (leaveType.allocationMethod === "MONTHLY_ACCRUAL") {
    allocatedDays = 0;
  }

  if (leaveType.allocationMethod === "MANUAL") {
    allocatedDays = 0;
  }

  const balanceData = {
    companyId,

    employeeId: employee._id,
    companyAccessId: companyAccess._id,

    leaveTypeId: leaveType._id,
    leavePolicyId,

    leaveYearStart: start,
    leaveYearEnd: end,
    leaveYearLabel,

    allocationMethod: leaveType.allocationMethod,

    allocatedDays,
    accruedDays: 0,

    carriedForwardDays:
      leaveType.carryForwardEnabled === true
        ? Number(carriedForwardDays || 0)
        : 0,

    adjustedDays: 0,
    pendingDays: 0,
    usedDays: 0,
    lapsedDays: 0,

    monthlyBalances: [],
    adjustmentHistory: [],

    lastAccruedPeriodKey: null,

    status: "ACTIVE",

    createdBy: requesterContext.userId ?? null,
    updatedBy: requesterContext.userId ?? null,
  };

  let balance;

  if (session) {
    [balance] = await LeaveBalance.create([balanceData], {
      session,
    });
  } else {
    balance = await LeaveBalance.create(balanceData);
  }

  return balance;
};

/**
 * ============================================================
 * LIST BALANCES
 * ============================================================
 */

export const listLeaveBalances = async ({
  companyId,
  query,
  scopeFilter = {},
}) => {
  const {
    page = 1,
    limit = 20,
    employeeId,
    companyAccessId,
    leaveTypeId,
    leavePolicyId,
    allocationMethod,
    status,
    leaveYearStart,
    leaveYearEnd,
    sortBy = "leaveYearStart",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,

    /**
     * TEAM/EMPLOYEE visibility restrictions can be injected
     * by the scope resolver/service layer.
     */
    ...scopeFilter,
  };

  if (employeeId) {
    filter.employeeId = employeeId;
  }

  if (companyAccessId) {
    filter.companyAccessId = companyAccessId;
  }

  if (leaveTypeId) {
    filter.leaveTypeId = leaveTypeId;
  }

  if (leavePolicyId) {
    filter.leavePolicyId = leavePolicyId;
  }

  if (allocationMethod) {
    filter.allocationMethod = allocationMethod;
  }

  if (status) {
    filter.status = status;
  }

  if (leaveYearStart || leaveYearEnd) {
    filter.leaveYearStart = {};

    if (leaveYearStart) {
      filter.leaveYearStart.$gte = new Date(leaveYearStart);
    }

    if (leaveYearEnd) {
      filter.leaveYearStart.$lte = new Date(leaveYearEnd);
    }
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
    _id: 1,
  };

  const [items, total] = await Promise.all([
    LeaveBalance.find(filter)
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
          "employeeCode designation departmentId teamId roleId joiningDate status",
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
        select:
          "name code paymentType requiresBalance allocationMethod monthlyEntitlementDays maximumMonthlyUsageDays allowMonthlyAccumulation status",
      })
      .populate({
        path: "leavePolicyId",
        select: "name code leaveYearStartMonth leaveYearStartDay status",
      })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({
        virtuals: true,
      }),

    LeaveBalance.countDocuments(filter),
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
 * GET BALANCE
 * ============================================================
 */

export const getLeaveBalanceById = async ({ companyId, balanceId }) => {
  const balance = await LeaveBalance.findOne({
    _id: balanceId,
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
        "employeeCode designation departmentId teamId roleId joiningDate status",
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
      select:
        "name code paymentType requiresBalance allocationMethod monthlyEntitlementDays maximumMonthlyUsageDays allowMonthlyAccumulation status",
    })
    .populate({
      path: "leavePolicyId",
      select: "name code leaveYearStartMonth leaveYearStartDay status",
    })
    .lean({
      virtuals: true,
    });

  if (!balance) {
    throw new ApiError(404, "Leave balance not found.");
  }

  return balance;
};

/**
 * ============================================================
 * GET EMPLOYEE BALANCES
 * ============================================================
 */

export const getEmployeeLeaveBalances = async ({
  companyId,
  employeeId,
  query = {},
}) => {
  const {
    leaveTypeId,
    status,
    leaveYearStart,
    leaveYearEnd,
    sortBy = "leaveYearStart",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    employeeId,
    isDeleted: false,
  };

  if (leaveTypeId) {
    filter.leaveTypeId = leaveTypeId;
  }

  if (status) {
    filter.status = status;
  }

  if (leaveYearStart || leaveYearEnd) {
    filter.leaveYearStart = {};

    if (leaveYearStart) {
      filter.leaveYearStart.$gte = new Date(leaveYearStart);
    }

    if (leaveYearEnd) {
      filter.leaveYearStart.$lte = new Date(leaveYearEnd);
    }
  }

  return LeaveBalance.find(filter)
    .populate({
      path: "leaveTypeId",
      select:
        "name code paymentType requiresBalance allocationMethod monthlyEntitlementDays maximumMonthlyUsageDays allowMonthlyAccumulation allowHalfDay status",
    })
    .populate({
      path: "leavePolicyId",
      select: "name code leaveYearStartMonth leaveYearStartDay status",
    })
    .sort({
      [sortBy]: sortOrder === "asc" ? 1 : -1,
      _id: 1,
    })
    .lean({
      virtuals: true,
    });
};

/**
 * ============================================================
 * MANUAL BALANCE ADJUSTMENT
 * ============================================================
 */

export const adjustLeaveBalance = async ({
  companyId,
  balanceId,
  adjustmentDays,
  periodKey = null,
  reason,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedBalance = null;

  try {
    await session.withTransaction(async () => {
      const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
        session,
      });

      if (balance.status !== "ACTIVE") {
        throw new ApiError(409, "A closed leave balance cannot be adjusted.");
      }

      const adjustment = Number(adjustmentDays);

      if (
        !Number.isFinite(adjustment) ||
        adjustment === 0 ||
        !Number.isInteger(adjustment * 2)
      ) {
        throw new ApiError(
          400,
          "Leave adjustment must be a non-zero whole-day or half-day value.",
        );
      }

      /**
       * ============================================================
       * MONTHLY ACCRUAL ADJUSTMENT
       * ============================================================
       *
       * Monthly-accrual leave is controlled by individual YYYY-MM
       * buckets. Therefore an administrative adjustment must also
       * belong to a specific monthly bucket.
       */
      if (balance.allocationMethod === "MONTHLY_ACCRUAL") {
        if (!periodKey) {
          throw new ApiError(
            400,
            "Adjustment period is required for a monthly-accrual leave balance.",
          );
        }

        const bucket = balance.monthlyBalances.find(
          (item) => item.periodKey === periodKey,
        );

        if (!bucket) {
          throw new ApiError(
            409,
            `No monthly leave entitlement is available for ${periodKey}.`,
          );
        }

        const currentBucketAvailable = roundToHalfDay(
          Number(bucket.creditedDays || 0) +
            Number(bucket.adjustedDays || 0) -
            Number(bucket.pendingDays || 0) -
            Number(bucket.usedDays || 0) -
            Number(bucket.lapsedDays || 0),
        );

        const resultingBucketAvailable = roundToHalfDay(
          currentBucketAvailable + adjustment,
        );

        if (resultingBucketAvailable < 0) {
          throw new ApiError(
            409,
            `This adjustment would make the available leave balance for ${periodKey} negative.`,
          );
        }

        bucket.adjustedDays = roundToHalfDay(
          Number(bucket.adjustedDays || 0) + adjustment,
        );
      } else {
        /**
         * periodKey has no meaning for annual/manual balances.
         *
         * Reject it instead of silently ignoring incorrect input.
         */
        if (periodKey) {
          throw new ApiError(
            400,
            "Adjustment period is allowed only for monthly-accrual leave balances.",
          );
        }

        const currentAvailable = calculateAvailableDays(balance);

        const resultingAvailable = roundToHalfDay(
          currentAvailable + adjustment,
        );

        if (resultingAvailable < 0) {
          throw new ApiError(
            409,
            "This adjustment would make the available leave balance negative.",
          );
        }
      }

      /**
       * Keep the aggregate balance synchronized with the
       * monthly bucket adjustment.
       */
      balance.adjustedDays = roundToHalfDay(
        Number(balance.adjustedDays || 0) + adjustment,
      );

      balance.adjustmentHistory.push({
        adjustmentDays: adjustment,
        periodKey:
          balance.allocationMethod === "MONTHLY_ACCRUAL" ? periodKey : null,
        reason,
        adjustedBy: requesterContext.userId,
        adjustedAt: new Date(),
      });

      balance.updatedBy = requesterContext.userId ?? null;

      await balance.save({
        session,
      });

      updatedBalance = balance;
    });

    return updatedBalance;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * MONTHLY ACCRUAL
 * ============================================================
 */

export const accrueMonthlyLeaveBalance = async ({
  companyId,
  balanceId,
  periodDate,
  requesterContext,
  session: externalSession = null,
}) => {
  const ownSession = !externalSession;
  const session = externalSession ?? (await mongoose.startSession());

  let updatedBalance = null;

  const execute = async () => {
    const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
      session,
    });

    if (balance.status !== "ACTIVE") {
      throw new ApiError(
        409,
        "Monthly accrual cannot be applied to a closed leave balance.",
      );
    }

    if (balance.allocationMethod !== "MONTHLY_ACCRUAL") {
      throw new ApiError(
        400,
        "Monthly accrual is allowed only for monthly-accrual leave balances.",
      );
    }

    const leaveType = await findActiveLeaveType({
      companyId,
      leaveTypeId: balance.leaveTypeId,
      session,
    });

    const periodKey = getPeriodKey(periodDate);

    const existingMonthlyBalance = balance.monthlyBalances.find(
      (item) => item.periodKey === periodKey,
    );

    /**
     * Idempotency:
     * do not credit the same month twice.
     */
    if (existingMonthlyBalance) {
      updatedBalance = balance;
      return;
    }

    const periodStart = new Date(`${periodKey}-01T00:00:00.000Z`);

    if (
      periodStart < new Date(balance.leaveYearStart) ||
      periodStart > new Date(balance.leaveYearEnd)
    ) {
      throw new ApiError(
        400,
        "The requested accrual period is outside this leave year.",
      );
    }

    /**
     * Use-it-or-lose-it monthly leave.
     *
     * Before crediting the next period, lapse any unused
     * entitlement from previous monthly buckets when
     * accumulation is disabled.
     */
    if (leaveType.allowMonthlyAccumulation === false) {
      for (const monthlyBalance of balance.monthlyBalances) {
        if (monthlyBalance.periodKey >= periodKey) {
          continue;
        }

        const remainingDays =
          Number(monthlyBalance.creditedDays || 0) +
          Number(monthlyBalance.adjustedDays || 0) -
          Number(monthlyBalance.pendingDays || 0) -
          Number(monthlyBalance.usedDays || 0) -
          Number(monthlyBalance.lapsedDays || 0);

        if (remainingDays > 0) {
          const lapseAmount = roundToHalfDay(remainingDays);

          monthlyBalance.lapsedDays = roundToHalfDay(
            Number(monthlyBalance.lapsedDays || 0) + lapseAmount,
          );

          balance.lapsedDays = roundToHalfDay(
            Number(balance.lapsedDays || 0) + lapseAmount,
          );
        }
      }
    }

    const creditedDays = Number(leaveType.monthlyEntitlementDays || 0);

    if (creditedDays <= 0) {
      throw new ApiError(
        400,
        "The leave type does not have a valid monthly entitlement.",
      );
    }

    balance.monthlyBalances.push({
      periodKey,
      creditedDays,
      adjustedDays: 0,
      pendingDays: 0,
      usedDays: 0,
      lapsedDays: 0,
    });

    balance.accruedDays = roundToHalfDay(
      Number(balance.accruedDays || 0) + creditedDays,
    );

    balance.lastAccruedPeriodKey = periodKey;

    balance.updatedBy = requesterContext.userId ?? null;

    await balance.save({
      session,
    });

    updatedBalance = balance;
  };

  try {
    if (ownSession) {
      await session.withTransaction(execute);
    } else {
      await execute();
    }

    return updatedBalance;
  } finally {
    if (ownSession) {
      await session.endSession();
    }
  }
};

/**
 * ============================================================
 * CLOSE BALANCE
 * ============================================================
 */

export const closeLeaveBalance = async ({
  companyId,
  balanceId,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let closedBalance = null;

  try {
    await session.withTransaction(async () => {
      const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
        session,
      });

      if (balance.status === "CLOSED") {
        closedBalance = balance;
        return;
      }

      if (Number(balance.pendingDays || 0) > 0) {
        throw new ApiError(
          409,
          "The leave balance cannot be closed while leave days are reserved by pending requests.",
        );
      }

      /**
       * Remaining unused entitlement expires when this
       * balance is closed.
       *
       * Carry-forward into the NEXT balance will later be
       * calculated separately using the LeaveType rules.
       */
      const remainingAvailable = calculateAvailableDays(balance);

      if (remainingAvailable > 0) {
        balance.lapsedDays = roundToHalfDay(
          Number(balance.lapsedDays || 0) + remainingAvailable,
        );
      }

      balance.status = "CLOSED";
      balance.closedAt = new Date();

      balance.updatedBy = requesterContext.userId ?? null;

      await balance.save({
        session,
      });

      closedBalance = balance;
    });

    return closedBalance;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * MONTHLY REQUEST ALLOCATION HELPERS
 * ============================================================
 */

const validateBalanceAllocations = ({ allocations, expectedDays }) => {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw new ApiError(
      400,
      "Monthly-accrual leave requires balance allocations.",
    );
  }

  const seenPeriods = new Set();

  let totalDays = 0;

  for (const allocation of allocations) {
    const periodKey = allocation?.periodKey;
    const days = Number(allocation?.days);

    if (!periodKey || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) {
      throw new ApiError(
        400,
        "Monthly balance allocation period must use YYYY-MM format.",
      );
    }

    if (seenPeriods.has(periodKey)) {
      throw new ApiError(
        400,
        `Duplicate monthly balance allocation found for ${periodKey}.`,
      );
    }

    seenPeriods.add(periodKey);

    if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days * 2)) {
      throw new ApiError(
        400,
        "Monthly balance allocation days must use positive whole-day or half-day increments.",
      );
    }

    totalDays = roundToHalfDay(totalDays + days);
  }

  if (Math.abs(totalDays - Number(expectedDays)) > 0.001) {
    throw new ApiError(
      400,
      "Monthly balance allocations must equal the requested leave days.",
    );
  }

  return totalDays;
};

const findMonthlyBucketOrFail = (balance, periodKey) => {
  const bucket = balance.monthlyBalances.find(
    (item) => item.periodKey === periodKey,
  );

  if (!bucket) {
    throw new ApiError(
      409,
      `No monthly leave entitlement is available for ${periodKey}.`,
    );
  }

  return bucket;
};

const calculateMonthlyBucketAvailableDays = (bucket) =>
  roundToHalfDay(
    Number(bucket.creditedDays || 0) +
      Number(bucket.adjustedDays || 0) -
      Number(bucket.pendingDays || 0) -
      Number(bucket.usedDays || 0) -
      Number(bucket.lapsedDays || 0),
  );

/**
 * ============================================================
 * INTERNAL BALANCE OPERATIONS
 * ============================================================
 *
 * These functions will be consumed by leaveRequest.service.js.
 *
 * They should NOT be exposed as unrestricted public endpoints.
 */

/**
 * Reserve balance when a request is submitted.
 */
export const reserveLeaveBalance = async ({
  companyId,
  balanceId,
  days,
  allocations = [],
  requesterContext,
  session,
}) => {
  if (!session) {
    throw new ApiError(
      500,
      "A database transaction is required to reserve leave balance.",
    );
  }

  const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
    session,
  });

  if (balance.status !== "ACTIVE") {
    throw new ApiError(
      409,
      "Leave cannot be reserved against a closed balance.",
    );
  }

  const requestedDays = Number(days);

  if (
    !Number.isFinite(requestedDays) ||
    requestedDays <= 0 ||
    !Number.isInteger(requestedDays * 2)
  ) {
    throw new ApiError(
      400,
      "Reserved leave days must use positive whole-day or half-day increments.",
    );
  }

  /**
   * MONTHLY ACCRUAL
   */
  if (balance.allocationMethod === "MONTHLY_ACCRUAL") {
    validateBalanceAllocations({
      allocations,
      expectedDays: requestedDays,
    });

    const leaveType = await findActiveLeaveType({
      companyId,
      leaveTypeId: balance.leaveTypeId,
      session,
    });

    /**
     * Validate every bucket first.
     *
     * Do not mutate anything until the entire
     * request is known to be valid.
     */
    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      const allocationDays = Number(allocation.days);

      const availableDays = calculateMonthlyBucketAvailableDays(bucket);

      if (availableDays < allocationDays) {
        throw new ApiError(
          409,
          `Insufficient leave balance for ${allocation.periodKey}. Available: ${availableDays}, requested: ${allocationDays}.`,
        );
      }

      /**
       * Monthly usage limit.
       *
       * Pending reservations count toward the
       * monthly limit so multiple simultaneous
       * requests cannot bypass it.
       */
      if (
        leaveType.maximumMonthlyUsageDays !== null &&
        leaveType.maximumMonthlyUsageDays !== undefined
      ) {
        const maximumUsage = Number(leaveType.maximumMonthlyUsageDays);

        const projectedUsage = roundToHalfDay(
          Number(bucket.pendingDays || 0) +
            Number(bucket.usedDays || 0) +
            allocationDays,
        );

        if (maximumUsage > 0 && projectedUsage > maximumUsage) {
          throw new ApiError(
            409,
            `Monthly leave usage for ${allocation.periodKey} cannot exceed ${maximumUsage} day(s).`,
          );
        }
      }
    }

    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      bucket.pendingDays = roundToHalfDay(
        Number(bucket.pendingDays || 0) + Number(allocation.days),
      );
    }

    balance.pendingDays = roundToHalfDay(
      Number(balance.pendingDays || 0) + requestedDays,
    );

    balance.updatedBy = requesterContext.userId ?? null;

    await balance.save({
      session,
    });

    return balance;
  }

  /**
   * ANNUAL_UPFRONT / MANUAL
   */
  const availableDays = calculateAvailableDays(balance);

  if (availableDays < requestedDays) {
    throw new ApiError(409, "Insufficient available leave balance.");
  }

  balance.pendingDays = roundToHalfDay(
    Number(balance.pendingDays || 0) + requestedDays,
  );

  balance.updatedBy = requesterContext.userId ?? null;

  await balance.save({
    session,
  });

  return balance;
};

/**
 * Convert reserved days into used days after approval.
 */
export const consumeReservedLeaveBalance = async ({
  companyId,
  balanceId,
  days,
  allocations = [],
  requesterContext,
  session,
}) => {
  if (!session) {
    throw new ApiError(
      500,
      "A database transaction is required to consume leave balance.",
    );
  }

  const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
    session,
  });

  const consumedDays = Number(days);

  if (
    !Number.isFinite(consumedDays) ||
    consumedDays <= 0 ||
    !Number.isInteger(consumedDays * 2)
  ) {
    throw new ApiError(
      400,
      "Consumed leave days must use positive whole-day or half-day increments.",
    );
  }

  if (Number(balance.pendingDays || 0) < consumedDays) {
    throw new ApiError(
      409,
      "Reserved leave balance is insufficient for approval.",
    );
  }

  if (balance.allocationMethod === "MONTHLY_ACCRUAL") {
    validateBalanceAllocations({
      allocations,
      expectedDays: consumedDays,
    });

    /**
     * Validate first.
     */
    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      const allocationDays = Number(allocation.days);

      if (Number(bucket.pendingDays || 0) < allocationDays) {
        throw new ApiError(
          409,
          `Reserved monthly leave balance for ${allocation.periodKey} is insufficient for approval.`,
        );
      }
    }

    /**
     * Then mutate.
     */
    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      const allocationDays = Number(allocation.days);

      bucket.pendingDays = roundToHalfDay(
        Number(bucket.pendingDays || 0) - allocationDays,
      );

      bucket.usedDays = roundToHalfDay(
        Number(bucket.usedDays || 0) + allocationDays,
      );
    }
  }

  balance.pendingDays = roundToHalfDay(
    Number(balance.pendingDays || 0) - consumedDays,
  );

  balance.usedDays = roundToHalfDay(
    Number(balance.usedDays || 0) + consumedDays,
  );

  balance.updatedBy = requesterContext.userId ?? null;

  await balance.save({
    session,
  });

  return balance;
};

/**
 * Release reserved balance after rejection/cancellation.
 */
export const releaseReservedLeaveBalance = async ({
  companyId,
  balanceId,
  days,
  allocations = [],
  requesterContext,
  session,
}) => {
  if (!session) {
    throw new ApiError(
      500,
      "A database transaction is required to release leave balance.",
    );
  }

  const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
    session,
  });

  const releasedDays = Number(days);

  if (
    !Number.isFinite(releasedDays) ||
    releasedDays <= 0 ||
    !Number.isInteger(releasedDays * 2)
  ) {
    throw new ApiError(
      400,
      "Released leave days must use positive whole-day or half-day increments.",
    );
  }

  if (Number(balance.pendingDays || 0) < releasedDays) {
    throw new ApiError(
      409,
      "Reserved leave balance is insufficient for release.",
    );
  }

  if (balance.allocationMethod === "MONTHLY_ACCRUAL") {
    validateBalanceAllocations({
      allocations,
      expectedDays: releasedDays,
    });

    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      const allocationDays = Number(allocation.days);

      if (Number(bucket.pendingDays || 0) < allocationDays) {
        throw new ApiError(
          409,
          `Reserved monthly leave balance for ${allocation.periodKey} is insufficient for release.`,
        );
      }
    }

    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      bucket.pendingDays = roundToHalfDay(
        Number(bucket.pendingDays || 0) - Number(allocation.days),
      );
    }
  }

  balance.pendingDays = roundToHalfDay(
    Number(balance.pendingDays || 0) - releasedDays,
  );

  balance.updatedBy = requesterContext.userId ?? null;

  await balance.save({
    session,
  });

  return balance;
};

/**
 * Restore used days after an approved leave is cancelled.
 */
export const restoreConsumedLeaveBalance = async ({
  companyId,
  balanceId,
  days,
  allocations = [],
  requesterContext,
  session,
}) => {
  if (!session) {
    throw new ApiError(
      500,
      "A database transaction is required to restore consumed leave balance.",
    );
  }

  const balance = await findLeaveBalanceOrFail(companyId, balanceId, {
    session,
  });

  const restoredDays = Number(days);

  if (
    !Number.isFinite(restoredDays) ||
    restoredDays <= 0 ||
    !Number.isInteger(restoredDays * 2)
  ) {
    throw new ApiError(
      400,
      "Restored leave days must use positive whole-day or half-day increments.",
    );
  }

  if (Number(balance.usedDays || 0) < restoredDays) {
    throw new ApiError(
      409,
      "Used leave balance is insufficient for restoration.",
    );
  }

  if (balance.allocationMethod === "MONTHLY_ACCRUAL") {
    validateBalanceAllocations({
      allocations,
      expectedDays: restoredDays,
    });

    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      const allocationDays = Number(allocation.days);

      if (Number(bucket.usedDays || 0) < allocationDays) {
        throw new ApiError(
          409,
          `Used monthly leave balance for ${allocation.periodKey} is insufficient for restoration.`,
        );
      }
    }

    for (const allocation of allocations) {
      const bucket = findMonthlyBucketOrFail(balance, allocation.periodKey);

      bucket.usedDays = roundToHalfDay(
        Number(bucket.usedDays || 0) - Number(allocation.days),
      );
    }
  }

  balance.usedDays = roundToHalfDay(
    Number(balance.usedDays || 0) - restoredDays,
  );

  balance.updatedBy = requesterContext.userId ?? null;

  await balance.save({
    session,
  });

  return balance;
};
