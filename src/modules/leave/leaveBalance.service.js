import mongoose from "mongoose";

import LeaveBalance from "./leaveBalance.model.js";
import LeaveType from "./leaveType.model.js";
import LeavePolicy from "./leavePolicy.model.js";
import Employee from "../employees/employee.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import User from "../users/user.model.js";

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
 * BULK INITIALIZE LEAVE BALANCES
 * ============================================================
 *
 * Creates only missing leave balances for eligible ACTIVE employees.
 *
 * employeeIds:
 * - [] / omitted -> all eligible ACTIVE employees in the company
 * - supplied     -> only those eligible ACTIVE employees
 *
 * This operation is intentionally idempotent:
 * existing employee/type/year balances are skipped.
 */
export const initializeBulkLeaveBalances = async ({
  companyId,
  leavePolicyId,
  leaveYearStart,
  leaveYearEnd,
  leaveYearLabel,
  employeeIds = [],
  requesterContext,
}) => {
  const start = new Date(leaveYearStart);
  const end = new Date(leaveYearEnd);

  if (end < start) {
    throw new ApiError(
      400,
      "Leave year end cannot be before leave year start.",
    );
  }

  /**
   * ------------------------------------------------------------
   * 1. Resolve the selected active policy once.
   * ------------------------------------------------------------
   */
  const leavePolicy = await LeavePolicy.findOne({
    _id: leavePolicyId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  }).lean();

  if (!leavePolicy) {
    throw new ApiError(404, "Active leave policy not found.");
  }

  if (
    new Date(leavePolicy.effectiveFrom) > start ||
    (leavePolicy.effectiveTo && new Date(leavePolicy.effectiveTo) < start)
  ) {
    throw new ApiError(
      400,
      "The selected leave policy is not effective for this leave year.",
    );
  }

  /**
   * ------------------------------------------------------------
   * 2. Find applicable balance-based leave types once.
   * ------------------------------------------------------------
   */
  const leaveTypes = await LeaveType.find({
    companyId,
    isDeleted: false,
    status: "ACTIVE",
    requiresBalance: true,
    allocationMethod: {
      $ne: "NO_BALANCE",
    },

    /**
     * Leave type must overlap the requested leave year.
     *
     * Example:
     * Leave year: 2026-01-01 -> 2026-12-31
     * Leave type effective from: 2026-09-23
     *
     * This leave type is applicable for part of the leave year
     * and therefore still needs a balance.
     */
    effectiveFrom: {
      $lte: end,
    },

    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: start,
        },
      },
    ],
  })
    .select(
      "_id name code allocationMethod annualEntitlementDays carryForwardEnabled",
    )
    .lean();

  if (leaveTypes.length === 0) {
    throw new ApiError(
      409,
      "No applicable balance-based leave types were found for this leave year.",
    );
  }

  /**
   * ------------------------------------------------------------
   * 3. Resolve ACTIVE company-access records.
   * ------------------------------------------------------------
   */
  const accessFilter = {
    companyId,
    status: "ACTIVE",
    isDeleted: false,
  };

  /**
   * When specific employeeIds are supplied, first resolve their
   * Employee records so we can restrict CompanyAccess safely.
   */
  let requestedEmployeeMap = null;

  if (employeeIds.length > 0) {
    const requestedEmployees = await Employee.find({
      _id: {
        $in: employeeIds,
      },
      companyId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id companyAccessId")
      .lean();

    requestedEmployeeMap = new Map(
      requestedEmployees.map((employee) => [
        employee.companyAccessId.toString(),
        employee,
      ]),
    );

    accessFilter._id = {
      $in: requestedEmployees.map((employee) => employee.companyAccessId),
    };
  }

  /**
   * ------------------------------------------------------------
   * 4. Process employees in batches.
   * ------------------------------------------------------------
   *
   * We deliberately do not load an unlimited company workforce
   * into memory at once.
   */
  const BATCH_SIZE = 500;

  let lastAccessId = null;

  let processedEmployees = 0;
  let created = 0;
  let skippedExisting = 0;

  const failures = [];

  while (true) {
    const batchFilter = {
      ...accessFilter,
    };

    if (lastAccessId) {
      batchFilter._id = accessFilter._id
        ? {
            ...accessFilter._id,
            $gt: lastAccessId,
          }
        : {
            $gt: lastAccessId,
          };
    }

    const companyAccessBatch = await CompanyAccess.find(batchFilter)
      .select("_id companyId status")
      .sort({
        _id: 1,
      })
      .limit(BATCH_SIZE)
      .lean();

    if (companyAccessBatch.length === 0) {
      break;
    }

    lastAccessId = companyAccessBatch[companyAccessBatch.length - 1]._id;

    const accessIds = companyAccessBatch.map((access) => access._id);

    /**
     * For an all-company initialization we still verify that the
     * corresponding Employee record itself is ACTIVE.
     */
    let employees;

    if (requestedEmployeeMap) {
      employees = companyAccessBatch
        .map((access) => requestedEmployeeMap.get(access._id.toString()))
        .filter(Boolean);
    } else {
      employees = await Employee.find({
        companyId,
        companyAccessId: {
          $in: accessIds,
        },
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("_id companyAccessId")
        .lean();
    }

    if (employees.length === 0) {
      continue;
    }

    processedEmployees += employees.length;

    const employeeAccessIds = employees.map(
      (employee) => employee.companyAccessId,
    );

    /**
     * ----------------------------------------------------------
     * 5. Read existing balances for this employee batch.
     * ----------------------------------------------------------
     */
    const existingBalances = await LeaveBalance.find({
      companyId,

      companyAccessId: {
        $in: employeeAccessIds,
      },

      leaveTypeId: {
        $in: leaveTypes.map((leaveType) => leaveType._id),
      },

      leaveYearStart: start,

      isDeleted: false,
    })
      .select("companyAccessId leaveTypeId")
      .lean();

    const existingKeys = new Set(
      existingBalances.map(
        (balance) =>
          `${balance.companyAccessId.toString()}:${balance.leaveTypeId.toString()}`,
      ),
    );

    /**
     * ----------------------------------------------------------
     * 6. Build only missing employee/type combinations.
     * ----------------------------------------------------------
     */
    const operations = [];

    for (const employee of employees) {
      for (const leaveType of leaveTypes) {
        const key = `${employee.companyAccessId.toString()}:${leaveType._id.toString()}`;

        if (existingKeys.has(key)) {
          skippedExisting += 1;
          continue;
        }

        const allocatedDays =
          leaveType.allocationMethod === "ANNUAL_UPFRONT"
            ? Number(leaveType.annualEntitlementDays || 0)
            : 0;

        operations.push({
          updateOne: {
            filter: {
              companyId,
              companyAccessId: employee.companyAccessId,
              leaveTypeId: leaveType._id,
              leaveYearStart: start,
              isDeleted: false,
            },

            update: {
              $setOnInsert: {
                companyId,

                employeeId: employee._id,
                companyAccessId: employee.companyAccessId,

                leaveTypeId: leaveType._id,
                leavePolicyId: leavePolicy._id,

                leaveYearStart: start,
                leaveYearEnd: end,
                leaveYearLabel,

                allocationMethod: leaveType.allocationMethod,

                allocatedDays,
                accruedDays: 0,
                carriedForwardDays: 0,
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

                isDeleted: false,
              },
            },

            upsert: true,
          },
        });
      }
    }

    if (operations.length === 0) {
      continue;
    }

    /**
     * ----------------------------------------------------------
     * 7. Upsert missing balances in one database operation.
     * ----------------------------------------------------------
     *
     * ordered:false prevents one isolated write failure from
     * stopping unrelated employee balances in this batch.
     */
    try {
      const result = await LeaveBalance.bulkWrite(operations, {
        ordered: false,
      });

      const insertedCount = Number(result.upsertedCount ?? 0);

      created += insertedCount;

      /**
       * Another concurrent initializer may have inserted a balance
       * after our existence check but before bulkWrite.
       *
       * Upsert + unique database index protects correctness.
       */
      skippedExisting += operations.length - insertedCount;
    } catch (error) {
      /**
       * Duplicate-key races are safe because another operation
       * successfully created that same logical balance.
       */
      if (error?.code === 11000) {
        const insertedCount = Number(error?.result?.upsertedCount ?? 0);

        created += insertedCount;
        skippedExisting += operations.length - insertedCount;
      } else {
        failures.push({
          batchAfterCompanyAccessId: lastAccessId?.toString() ?? null,
          message:
            error?.message ??
            "Unknown bulk leave balance initialization error.",
        });
      }
    }
  }

  const possibleBalances = processedEmployees * leaveTypes.length;

  return {
    processedEmployees,

    processedLeaveTypes: leaveTypes.length,

    possibleBalances,

    created,

    skippedExisting,

    failedBatches: failures.length,

    failures,
  };
};

/**
 * Apply a requested companyAccessId without allowing it to
 * expand or override the requester's authorized scope.
 *
 * scopeFilter is authoritative.
 * Query filters may only narrow that scope.
 */
const applyCompanyAccessScope = ({
  filter,
  scopeFilter = {},
  requestedCompanyAccessId = null,
  castObjectId = false,
}) => {
  const authorizedCompanyAccess = scopeFilter.companyAccessId;

  const castId = (value) =>
    castObjectId ? new mongoose.Types.ObjectId(value.toString()) : value;

  /**
   * No scope restriction means COMPANY/GLOBAL access.
   * The requested companyAccessId may safely narrow the query.
   */
  if (!authorizedCompanyAccess) {
    if (requestedCompanyAccessId) {
      filter.companyAccessId = castId(requestedCompanyAccessId);
    }

    return;
  }

  /**
   * Restricted scope using $in.
   *
   * If the caller also requested one companyAccessId,
   * require BOTH conditions instead of replacing the scope.
   */
  if (authorizedCompanyAccess.$in) {
    const authorizedIds = authorizedCompanyAccess.$in.map(castId);

    if (requestedCompanyAccessId) {
      const requestedId = castId(requestedCompanyAccessId);

      filter.$and = [
        ...(filter.$and ?? []),
        {
          companyAccessId: {
            $in: authorizedIds,
          },
        },
        {
          companyAccessId: requestedId,
        },
      ];
    } else {
      filter.companyAccessId = {
        $in: authorizedIds,
      };
    }

    return;
  }

  /**
   * Restricted scope containing one companyAccessId.
   */
  const authorizedId = castId(authorizedCompanyAccess);

  if (requestedCompanyAccessId) {
    filter.$and = [
      ...(filter.$and ?? []),
      {
        companyAccessId: authorizedId,
      },
      {
        companyAccessId: castId(requestedCompanyAccessId),
      },
    ];
  } else {
    filter.companyAccessId = authorizedId;
  }
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
    search,
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
  };

  if (employeeId) {
    filter.employeeId = employeeId;
  }

  applyCompanyAccessScope({
    filter,
    scopeFilter,
    requestedCompanyAccessId: companyAccessId,
  });

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

  if (search) {
    const searchRegex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );

    /**
     * Search user names first.
     *
     * Employee does not store the employee's name directly;
     * it references User through userId.
     */
    const matchingUsers = await User.find({
      isDeleted: false,
      $or: [
        { firstName: searchRegex },
        { middleName: searchRegex },
        { lastName: searchRegex },
        { displayName: searchRegex },
      ],
    })
      .select("_id")
      .lean();

    const matchingUserIds = matchingUsers.map((user) => user._id);

    /**
     * Resolve employees whose linked User matched the search.
     *
     * companyId is mandatory here so search never crosses companies.
     */
    const matchingEmployees =
      matchingUserIds.length > 0
        ? await Employee.find({
            companyId,
            userId: {
              $in: matchingUserIds,
            },
            isDeleted: false,
          })
            .select("_id")
            .lean()
        : [];

    const matchingEmployeeIds = matchingEmployees.map(
      (employee) => employee._id,
    );

    /**
     * Employee code belongs to CompanyAccess.
     */
    const matchingCompanyAccessRecords = await CompanyAccess.find({
      companyId,
      employeeCode: searchRegex,
      isDeleted: false,
    })
      .select("_id")
      .lean();

    const matchingCompanyAccessIds = matchingCompanyAccessRecords.map(
      (access) => access._id,
    );

    /**
     * Leave type name/code search.
     */
    const matchingLeaveTypes = await LeaveType.find({
      companyId,
      isDeleted: false,
      $or: [{ name: searchRegex }, { code: searchRegex }],
    })
      .select("_id")
      .lean();

    const matchingLeaveTypeIds = matchingLeaveTypes.map(
      (leaveType) => leaveType._id,
    );

    /**
     * Search must NARROW the existing balance filter.
     *
     * It must never replace:
     * - companyId
     * - authorization scope
     * - explicit filters
     */
    filter.$and = [
      ...(filter.$and ?? []),
      {
        $or: [
          {
            employeeId: {
              $in: matchingEmployeeIds,
            },
          },
          {
            companyAccessId: {
              $in: matchingCompanyAccessIds,
            },
          },
          {
            leaveTypeId: {
              $in: matchingLeaveTypeIds,
            },
          },
        ],
      },
    ];
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
 * GET LEAVE BALANCE SUMMARY
 * ============================================================
 *
 * Returns aggregate totals for leave balances visible to the
 * authenticated requester.
 *
 * IMPORTANT:
 * scopeFilter must come from the same scope resolver used by
 * listLeaveBalances so COMPANY / TEAM / SELF visibility remains
 * consistent.
 */
export const getLeaveBalanceSummary = async ({
  companyId,
  query = {},
  scopeFilter = {},
}) => {
  const {
    employeeId,
    companyAccessId,
    leaveTypeId,
    leavePolicyId,
    allocationMethod,
    status,
    leaveYearStart,
    leaveYearEnd,
  } = query;

  const filter = {
    companyId: new mongoose.Types.ObjectId(companyId),
    isDeleted: false,
  };

  applyCompanyAccessScope({
    filter,
    scopeFilter,
    requestedCompanyAccessId: companyAccessId,
    castObjectId: true,
  });

  if (employeeId) {
    filter.employeeId = new mongoose.Types.ObjectId(employeeId);
  }

  if (leaveTypeId) {
    filter.leaveTypeId = new mongoose.Types.ObjectId(leaveTypeId);
  }

  if (leavePolicyId) {
    filter.leavePolicyId = new mongoose.Types.ObjectId(leavePolicyId);
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

  // keep your existing aggregation below unchanged
  const [summary] = await LeaveBalance.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: null,

        totalBalances: {
          $sum: 1,
        },

        availableDays: {
          $sum: {
            $cond: [
              {
                $eq: ["$allocationMethod", "MONTHLY_ACCRUAL"],
              },

              // MONTHLY ACCRUAL:
              // Count only buckets that have actually been accrued/credited.
              // Future projected reservation buckets must not reduce
              // currently available leave.
              {
                $sum: {
                  $map: {
                    input: {
                      $filter: {
                        input: {
                          $ifNull: ["$monthlyBalances", []],
                        },
                        as: "month",
                        cond: {
                          $or: [
                            {
                              $eq: ["$$month.isAccrued", true],
                            },
                            {
                              $gt: [
                                {
                                  $ifNull: ["$$month.creditedDays", 0],
                                },
                                0,
                              ],
                            },
                          ],
                        },
                      },
                    },

                    as: "month",

                    in: {
                      $let: {
                        vars: {
                          monthAvailable: {
                            $subtract: [
                              {
                                $add: [
                                  {
                                    $ifNull: ["$$month.creditedDays", 0],
                                  },
                                  {
                                    $ifNull: ["$$month.adjustedDays", 0],
                                  },
                                ],
                              },
                              {
                                $add: [
                                  {
                                    $ifNull: ["$$month.pendingDays", 0],
                                  },
                                  {
                                    $ifNull: ["$$month.usedDays", 0],
                                  },
                                  {
                                    $ifNull: ["$$month.lapsedDays", 0],
                                  },
                                ],
                              },
                            ],
                          },
                        },

                        in: {
                          $cond: [
                            {
                              $gt: ["$$monthAvailable", 0],
                            },
                            "$$monthAvailable",
                            0,
                          ],
                        },
                      },
                    },
                  },
                },
              },

              // ANNUAL_UPFRONT / MANUAL etc.
              {
                $let: {
                  vars: {
                    balanceAvailable: {
                      $subtract: [
                        {
                          $add: [
                            {
                              $ifNull: ["$allocatedDays", 0],
                            },
                            {
                              $ifNull: ["$accruedDays", 0],
                            },
                            {
                              $ifNull: ["$carriedForwardDays", 0],
                            },
                            {
                              $ifNull: ["$adjustedDays", 0],
                            },
                          ],
                        },
                        {
                          $add: [
                            {
                              $ifNull: ["$pendingDays", 0],
                            },
                            {
                              $ifNull: ["$usedDays", 0],
                            },
                            {
                              $ifNull: ["$lapsedDays", 0],
                            },
                          ],
                        },
                      ],
                    },
                  },

                  in: {
                    $cond: [
                      {
                        $gt: ["$$balanceAvailable", 0],
                      },
                      "$$balanceAvailable",
                      0,
                    ],
                  },
                },
              },
            ],
          },
        },

        pendingDays: {
          $sum: {
            $ifNull: ["$pendingDays", 0],
          },
        },

        usedDays: {
          $sum: {
            $ifNull: ["$usedDays", 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalBalances: 1,

        availableDays: {
          $round: ["$availableDays", 2],
        },

        pendingDays: {
          $round: ["$pendingDays", 2],
        },

        usedDays: {
          $round: ["$usedDays", 2],
        },
      },
    },
  ]);

  return (
    summary ?? {
      totalBalances: 0,
      availableDays: 0,
      pendingDays: 0,
      usedDays: 0,
    }
  );
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
     *
     * A bucket may already exist because a future leave request reserved
     * projected entitlement against this month.
     *
     * Only an ACTUALLY accrued bucket should prevent another accrual.
     */
    const existingBucketIsAccrued =
      existingMonthlyBalance &&
      (existingMonthlyBalance.isAccrued === true ||
        Number(existingMonthlyBalance.creditedDays || 0) > 0);

    if (existingBucketIsAccrued) {
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
     * The requested accrual month must overlap the leave type's
     * effective date range.
     *
     * Example:
     * Leave type effectiveFrom: 2026-09-23
     * Requested accrual period: 2026-09
     *
     * September is valid because the leave type becomes effective
     * during that month.
     *
     * August 2026 is invalid because the leave type was not yet
     * effective during that month.
     */
    const periodEnd = new Date(
      Date.UTC(
        periodStart.getUTCFullYear(),
        periodStart.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );

    const leaveTypeEffectiveFrom = new Date(leaveType.effectiveFrom);
    const leaveTypeEffectiveTo = leaveType.effectiveTo
      ? new Date(leaveType.effectiveTo)
      : null;

    if (
      periodEnd < leaveTypeEffectiveFrom ||
      (leaveTypeEffectiveTo && periodStart > leaveTypeEffectiveTo)
    ) {
      throw new ApiError(
        400,
        `The leave type is not effective for accrual period ${periodKey}.`,
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

        // Only an actually accrued month can lapse.
        // A projected bucket may exist only because future leave
        // was reserved against that month's expected entitlement.
        const monthlyBucketIsAccrued =
          monthlyBalance.isAccrued === true ||
          Number(monthlyBalance.creditedDays || 0) > 0;

        if (!monthlyBucketIsAccrued) {
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

    /**
     * The bucket may already exist because projected future entitlement
     * was reserved before this month was actually accrued.
     *
     * In that case, convert the existing projected bucket into an accrued
     * bucket without destroying its pending/used values.
     */
    if (existingMonthlyBalance) {
      existingMonthlyBalance.creditedDays = creditedDays;
      existingMonthlyBalance.isAccrued = true;
    } else {
      balance.monthlyBalances.push({
        periodKey,
        isAccrued: true,
        creditedDays,
        adjustedDays: 0,
        pendingDays: 0,
        usedDays: 0,
        lapsedDays: 0,
      });
    }

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
 * BULK MONTHLY ACCRUAL
 * ============================================================
 *
 * Accrues all eligible ACTIVE monthly-accrual leave balances
 * for one company and one requested month.
 *
 * This operation intentionally reuses accrueMonthlyLeaveBalance()
 * so the single-balance and bulk flows follow exactly the same
 * accrual rules.
 *
 * It is safe to run repeatedly:
 * already-accrued monthly buckets are skipped by the underlying
 * single-balance accrual operation.
 */
export const accrueBulkMonthlyLeaveBalances = async ({
  companyId,
  periodDate,
  requesterContext,
}) => {
  /**
   * Validate the requested period before deriving YYYY-MM.
   *
   * This matters because this service will later also be called
   * directly by the scheduled job, not only through HTTP/Zod.
   */
  const parsedPeriodDate = new Date(periodDate);

  if (Number.isNaN(parsedPeriodDate.getTime())) {
    throw new ApiError(400, "Invalid monthly accrual period.");
  }

  const periodKey = getPeriodKey(parsedPeriodDate);

  const periodStart = new Date(`${periodKey}-01T00:00:00.000Z`);

  const periodEnd = new Date(
    Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );

  /**
   * ============================================================
   * 1. FIND LEAVE TYPES EFFECTIVE FOR THIS MONTH
   * ============================================================
   *
   * A leave type is applicable when its effective date range
   * overlaps the requested month.
   *
   * Example:
   * effectiveFrom = 2026-09-23
   *
   * August    -> not applicable
   * September -> applicable
   */
  const applicableLeaveTypes = await LeaveType.find({
    companyId,
    isDeleted: false,
    status: "ACTIVE",
    requiresBalance: true,
    allocationMethod: "MONTHLY_ACCRUAL",

    effectiveFrom: {
      $lte: periodEnd,
    },

    $or: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          $gte: periodStart,
        },
      },
    ],
  })
    .select("_id")
    .lean();

  const applicableLeaveTypeIds = applicableLeaveTypes.map(
    (leaveType) => leaveType._id,
  );

  /**
   * No monthly leave type is applicable for this month.
   *
   * This is a valid no-op, not an error.
   */
  if (applicableLeaveTypeIds.length === 0) {
    return {
      periodKey,
      processed: 0,
      eligible: 0,
      accrued: 0,
      alreadyAccrued: 0,
      skippedInactiveEmployee: 0,
      skippedInactiveCompanyAccess: 0,
      failed: 0,
      failures: [],
    };
  }

  /**
   * ============================================================
   * 2. FIND APPLICABLE MONTHLY BALANCES
   * ============================================================
   */
  const baseFilter = {
    companyId,
    isDeleted: false,
    status: "ACTIVE",
    allocationMethod: "MONTHLY_ACCRUAL",

    leaveTypeId: {
      $in: applicableLeaveTypeIds,
    },

    /**
     * The requested month must overlap the balance's leave year.
     */
    leaveYearStart: {
      $lte: periodEnd,
    },

    leaveYearEnd: {
      $gte: periodStart,
    },
  };

  const BATCH_SIZE = 500;

  let lastBalanceId = null;

  let processed = 0;
  let eligible = 0;
  let accrued = 0;
  let alreadyAccrued = 0;
  let skippedInactiveEmployee = 0;
  let skippedInactiveCompanyAccess = 0;
  let failed = 0;

  const failures = [];

  while (true) {
    const filter = {
      ...baseFilter,
    };

    if (lastBalanceId) {
      filter._id = {
        $gt: lastBalanceId,
      };
    }

    const balances = await LeaveBalance.find(filter)
      .select("_id employeeId companyAccessId monthlyBalances")
      .sort({
        _id: 1,
      })
      .limit(BATCH_SIZE)
      .lean();

    if (balances.length === 0) {
      break;
    }

    lastBalanceId = balances[balances.length - 1]._id;

    /**
     * Resolve active employees and company-access records once
     * for the complete batch.
     */
    const employeeIds = [
      ...new Set(
        balances
          .map((balance) => balance.employeeId?.toString())
          .filter(Boolean),
      ),
    ];

    const companyAccessIds = [
      ...new Set(
        balances
          .map((balance) => balance.companyAccessId?.toString())
          .filter(Boolean),
      ),
    ];

    const [activeEmployees, activeCompanyAccessRecords] = await Promise.all([
      Employee.find({
        _id: {
          $in: employeeIds,
        },
        companyId,
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("_id")
        .lean(),

      CompanyAccess.find({
        _id: {
          $in: companyAccessIds,
        },
        companyId,
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("_id")
        .lean(),
    ]);

    const activeEmployeeIds = new Set(
      activeEmployees.map((employee) => employee._id.toString()),
    );

    const activeCompanyAccessIds = new Set(
      activeCompanyAccessRecords.map((access) => access._id.toString()),
    );

    for (const balance of balances) {
      processed += 1;

      /**
       * Do not routinely credit inactive employees.
       */
      if (
        !balance.employeeId ||
        !activeEmployeeIds.has(balance.employeeId.toString())
      ) {
        skippedInactiveEmployee += 1;
        continue;
      }

      /**
       * Do not routinely credit inactive company access.
       */
      if (
        !balance.companyAccessId ||
        !activeCompanyAccessIds.has(balance.companyAccessId.toString())
      ) {
        skippedInactiveCompanyAccess += 1;
        continue;
      }

      eligible += 1;

      /**
       * Fast idempotency check.
       *
       * accrueMonthlyLeaveBalance() performs the authoritative
       * check again.
       */
      const existingMonthlyBalance = balance.monthlyBalances?.find(
        (item) => item.periodKey === periodKey,
      );

      const isAlreadyAccrued =
        existingMonthlyBalance &&
        (existingMonthlyBalance.isAccrued === true ||
          Number(existingMonthlyBalance.creditedDays || 0) > 0);

      if (isAlreadyAccrued) {
        alreadyAccrued += 1;
        continue;
      }

      try {
        /**
         * Reuse the authoritative individual accrual operation.
         */
        const updatedBalance = await accrueMonthlyLeaveBalance({
          companyId,
          balanceId: balance._id,
          periodDate: parsedPeriodDate,
          requesterContext,
        });

        const updatedBucket = updatedBalance?.monthlyBalances?.find(
          (item) => item.periodKey === periodKey,
        );

        const isAccruedNow =
          updatedBucket &&
          (updatedBucket.isAccrued === true ||
            Number(updatedBucket.creditedDays || 0) > 0);

        if (isAccruedNow) {
          accrued += 1;
        } else {
          alreadyAccrued += 1;
        }
      } catch (error) {
        failed += 1;

        failures.push({
          balanceId: balance._id.toString(),
          message: error?.message ?? "Unknown monthly leave accrual error.",
        });
      }
    }
  }

  return {
    periodKey,
    processed,
    eligible,
    accrued,
    alreadyAccrued,
    skippedInactiveEmployee,
    skippedInactiveCompanyAccess,
    failed,
    failures,
  };
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
 * Find an existing monthly bucket or create an empty bucket that can
 * hold a reservation against a future monthly entitlement.
 *
 * Creating the bucket does NOT mean the month has been accrued.
 */
const findOrCreateMonthlyBucket = (balance, periodKey) => {
  let bucket = balance.monthlyBalances.find(
    (item) => item.periodKey === periodKey,
  );

  if (bucket) {
    return bucket;
  }

  balance.monthlyBalances.push({
    periodKey,
    isAccrued: false,
    creditedDays: 0,
    adjustedDays: 0,
    pendingDays: 0,
    usedDays: 0,
    lapsedDays: 0,
  });

  bucket = balance.monthlyBalances.find((item) => item.periodKey === periodKey);

  return bucket;
};

/**
 * Calculate usable capacity for a monthly bucket.
 *
 * Accrued bucket:
 *   use the actual credited balance.
 *
 * Future non-accrued bucket:
 *   use the configured monthly entitlement as projected capacity,
 *   while subtracting anything already reserved/used against it.
 */
const calculateMonthlyBucketUsableDays = ({ bucket, leaveType }) => {
  const isActuallyAccrued =
    bucket.isAccrued === true || Number(bucket.creditedDays || 0) > 0;

  if (isActuallyAccrued) {
    return Math.max(0, calculateMonthlyBucketAvailableDays(bucket));
  }

  const projectedEntitlement = Number(leaveType.monthlyEntitlementDays || 0);

  const projectedAvailable =
    projectedEntitlement +
    Number(bucket.adjustedDays || 0) -
    Number(bucket.pendingDays || 0) -
    Number(bucket.usedDays || 0) -
    Number(bucket.lapsedDays || 0);

  return Math.max(0, roundToHalfDay(projectedAvailable));
};

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

    const currentPeriodKey = getPeriodKey(new Date());

    /**
     * Validate every allocation period first.
     *
     * Future monthly buckets may not exist yet, so create an empty
     * projected bucket when necessary. Creating the bucket does NOT
     * mean that the entitlement has been accrued.
     */
    for (const allocation of allocations) {
      const periodKey = allocation.periodKey;
      const allocationDays = Number(allocation.days);

      const periodStart = new Date(`${periodKey}-01T00:00:00.000Z`);

      /**
       * A projected monthly reservation must still belong to this
       * balance's leave year.
       */
      if (
        periodStart < new Date(balance.leaveYearStart) ||
        periodStart > new Date(balance.leaveYearEnd)
      ) {
        throw new ApiError(
          400,
          `Leave balance allocation period ${periodKey} is outside this leave year.`,
        );
      }

      let bucket = balance.monthlyBalances.find(
        (item) => item.periodKey === periodKey,
      );

      if (!bucket) {
        if (periodKey <= currentPeriodKey) {
          throw new ApiError(
            409,
            `No accrued monthly leave entitlement is available for ${periodKey}.`,
          );
        }

        bucket = findOrCreateMonthlyBucket(balance, periodKey);
      }

      const bucketIsAccrued =
        bucket.isAccrued === true || Number(bucket.creditedDays || 0) > 0;

      if (!bucketIsAccrued && periodKey <= currentPeriodKey) {
        throw new ApiError(
          409,
          `Monthly leave entitlement for ${periodKey} has not been accrued.`,
        );
      }

      const availableDays = calculateMonthlyBucketUsableDays({
        bucket,
        leaveType,
      });

      if (availableDays < allocationDays) {
        throw new ApiError(
          409,
          `Insufficient leave balance for ${periodKey}. Available: ${availableDays}, requested: ${allocationDays}.`,
        );
      }

      /**
       * Monthly usage limit.
       *
       * Both pending and already-approved usage count toward the
       * monthly limit.
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
            `Monthly leave usage for ${periodKey} cannot exceed ${maximumUsage} day(s).`,
          );
        }
      }
    }

    /**
     * All periods are valid.
     *
     * Reserve the paid allocation against each corresponding
     * monthly bucket.
     */
    for (const allocation of allocations) {
      const bucket = findOrCreateMonthlyBucket(balance, allocation.periodKey);

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
