import LeaveType from "./leaveType.model.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLeaveTypeName = (name) => name.replace(/\s+/g, " ").trim();

const normalizeLeaveTypeCode = (code) => code.trim().toUpperCase();

/**
 * Ensure the leave type exists inside the selected company.
 */
const findLeaveTypeOrFail = async (
  companyId,
  leaveTypeId,
  { lean = false } = {},
) => {
  let query = LeaveType.findOne({
    _id: leaveTypeId,
    companyId,
    isDeleted: false,
  });

  if (lean) {
    query = query.lean();
  }

  const leaveType = await query;

  if (!leaveType) {
    throw new ApiError(404, "Leave type not found.");
  }

  return leaveType;
};

/**
 * Ensure name/code are unique inside one company.
 */
const validateLeaveTypeUniqueness = async ({
  companyId,
  name,
  code,
  excludeLeaveTypeId = null,
}) => {
  const conditions = [];

  if (name) {
    const normalizedName = normalizeLeaveTypeName(name);

    conditions.push({
      name: {
        $regex: `^${escapeRegex(normalizedName)}$`,
        $options: "i",
      },
    });
  }

  if (code) {
    conditions.push({
      code: normalizeLeaveTypeCode(code),
    });
  }

  if (conditions.length === 0) {
    return;
  }

  const filter = {
    companyId,
    isDeleted: false,
    $or: conditions,
  };

  if (excludeLeaveTypeId) {
    filter._id = {
      $ne: excludeLeaveTypeId,
    };
  }

  const duplicateLeaveType = await LeaveType.findOne(filter)
    .select("_id name code")
    .lean();

  if (!duplicateLeaveType) {
    return;
  }

  if (
    name &&
    duplicateLeaveType.name.toLowerCase() ===
      normalizeLeaveTypeName(name).toLowerCase()
  ) {
    throw new ApiError(
      409,
      "A leave type with this name already exists in the company.",
    );
  }

  if (code && duplicateLeaveType.code === normalizeLeaveTypeCode(code)) {
    throw new ApiError(
      409,
      "A leave type with this code already exists in the company.",
    );
  }

  throw new ApiError(
    409,
    "A leave type with the provided name or code already exists.",
  );
};

/**
 * Validate the COMPLETE leave-type configuration.
 *
 * This helper is used for both:
 * - CREATE data
 * - existing + PATCH data
 */
const validateLeaveTypeConfiguration = (data) => {
  if (
    data.effectiveFrom &&
    data.effectiveTo &&
    new Date(data.effectiveTo) < new Date(data.effectiveFrom)
  ) {
    throw new ApiError(
      400,
      "Leave type effective-to cannot be earlier than effective-from.",
    );
  }

  if (data.allocationMethod === "ANNUAL_UPFRONT") {
    if (Number(data.annualEntitlementDays || 0) <= 0) {
      throw new ApiError(
        400,
        "Annual entitlement must be greater than 0 for annual-upfront leave.",
      );
    }
  }

  if (data.allocationMethod === "MONTHLY_ACCRUAL") {
    if (Number(data.monthlyEntitlementDays || 0) <= 0) {
      throw new ApiError(
        400,
        "Monthly entitlement must be greater than 0 for monthly-accrual leave.",
      );
    }
  }

  if (
    data.allowBackdatedApplication === false &&
    Number(data.maximumBackdatedDays || 0) > 0
  ) {
    throw new ApiError(
      400,
      "Maximum backdated days must be 0 when backdated applications are disabled.",
    );
  }

  if (
    data.carryForwardEnabled === false &&
    Number(data.maximumCarryForwardDays || 0) > 0
  ) {
    throw new ApiError(
      400,
      "Maximum carry-forward days must be 0 when carry forward is disabled.",
    );
  }

  /**
   * NO_BALANCE means the leave does not consume a stored entitlement.
   */
  if (data.allocationMethod === "NO_BALANCE" && data.requiresBalance === true) {
    throw new ApiError(
      400,
      "No-balance leave types cannot require a leave balance.",
    );
  }

  /**
   * Balance-based allocation methods must use a balance.
   */
  if (
    ["ANNUAL_UPFRONT", "MONTHLY_ACCRUAL", "MANUAL"].includes(
      data.allocationMethod,
    ) &&
    data.requiresBalance === false
  ) {
    throw new ApiError(
      400,
      `${data.allocationMethod} leave types must require a leave balance.`,
    );
  }

  /**
   * Monthly-only settings belong only to MONTHLY_ACCRUAL.
   */
  if (
    data.allocationMethod !== "MONTHLY_ACCRUAL" &&
    Number(data.monthlyEntitlementDays || 0) > 0
  ) {
    throw new ApiError(
      400,
      "Monthly entitlement is allowed only for monthly-accrual leave.",
    );
  }

  if (
    data.allocationMethod !== "MONTHLY_ACCRUAL" &&
    data.maximumMonthlyUsageDays != null
  ) {
    throw new ApiError(
      400,
      "Maximum monthly usage is allowed only for monthly-accrual leave.",
    );
  }

  if (
    data.allocationMethod === "MONTHLY_ACCRUAL" &&
    data.maximumMonthlyUsageDays != null &&
    Number(data.maximumMonthlyUsageDays) <= 0
  ) {
    throw new ApiError(
      400,
      "Maximum monthly usage days must be greater than 0.",
    );
  }

  if (
    data.requireAttachment === false &&
    data.attachmentRequiredFromDays != null
  ) {
    throw new ApiError(
      400,
      "Attachment threshold cannot be configured when attachments are not required.",
    );
  }
};

/**
 * Build a complete leave-type configuration from an existing
 * document plus PATCH data.
 */
const buildMergedLeaveTypeConfiguration = (existingLeaveType, data) => ({
  allocationMethod:
    data.allocationMethod !== undefined
      ? data.allocationMethod
      : existingLeaveType.allocationMethod,

  requiresBalance:
    data.requiresBalance !== undefined
      ? data.requiresBalance
      : existingLeaveType.requiresBalance,

  annualEntitlementDays:
    data.annualEntitlementDays !== undefined
      ? data.annualEntitlementDays
      : existingLeaveType.annualEntitlementDays,

  monthlyEntitlementDays:
    data.monthlyEntitlementDays !== undefined
      ? data.monthlyEntitlementDays
      : existingLeaveType.monthlyEntitlementDays,

  maximumMonthlyUsageDays:
    data.maximumMonthlyUsageDays !== undefined
      ? data.maximumMonthlyUsageDays
      : existingLeaveType.maximumMonthlyUsageDays,

  allowMonthlyAccumulation:
    data.allowMonthlyAccumulation !== undefined
      ? data.allowMonthlyAccumulation
      : existingLeaveType.allowMonthlyAccumulation,

  allowBackdatedApplication:
    data.allowBackdatedApplication !== undefined
      ? data.allowBackdatedApplication
      : existingLeaveType.allowBackdatedApplication,

  maximumBackdatedDays:
    data.maximumBackdatedDays !== undefined
      ? data.maximumBackdatedDays
      : existingLeaveType.maximumBackdatedDays,

  requireAttachment:
    data.requireAttachment !== undefined
      ? data.requireAttachment
      : existingLeaveType.requireAttachment,

  attachmentRequiredFromDays:
    data.attachmentRequiredFromDays !== undefined
      ? data.attachmentRequiredFromDays
      : existingLeaveType.attachmentRequiredFromDays,

  carryForwardEnabled:
    data.carryForwardEnabled !== undefined
      ? data.carryForwardEnabled
      : existingLeaveType.carryForwardEnabled,

  maximumCarryForwardDays:
    data.maximumCarryForwardDays !== undefined
      ? data.maximumCarryForwardDays
      : existingLeaveType.maximumCarryForwardDays,

  effectiveFrom:
    data.effectiveFrom !== undefined
      ? data.effectiveFrom
      : existingLeaveType.effectiveFrom,

  effectiveTo:
    data.effectiveTo !== undefined
      ? data.effectiveTo
      : existingLeaveType.effectiveTo,
});

/**
 * ============================================================
 * CREATE LEAVE TYPE
 * ============================================================
 */

export const createLeaveType = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const normalizedData = {
    ...data,

    name: normalizeLeaveTypeName(data.name),

    code: normalizeLeaveTypeCode(data.code),
  };

  validateLeaveTypeConfiguration(normalizedData);

  await validateLeaveTypeUniqueness({
    companyId,
    name: normalizedData.name,
    code: normalizedData.code,
  });

  const leaveType = await LeaveType.create({
    companyId,

    ...normalizedData,

    createdBy: requesterContext.userId ?? null,
    updatedBy: requesterContext.userId ?? null,
  });

  return leaveType;
};

/**
 * ============================================================
 * LIST LEAVE TYPES
 * ============================================================
 */

export const listLeaveTypes = async ({ companyId, query }) => {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    paymentType,
    allocationMethod,
    effectiveOn,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (paymentType) {
    filter.paymentType = paymentType;
  }

  if (allocationMethod) {
    filter.allocationMethod = allocationMethod;
  }

  if (search) {
    const escapedSearch = escapeRegex(search);

    filter.$or = [
      {
        name: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        code: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        description: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
    ];
  }

  if (effectiveOn) {
    const effectiveDate = new Date(effectiveOn);

    filter.effectiveFrom = {
      $lte: effectiveDate,
    };

    filter.$and = [
      {
        $or: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              $gte: effectiveDate,
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
    LeaveType.find(filter).sort(sort).skip(skip).limit(limit).lean(),

    LeaveType.countDocuments(filter),
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
 * GET LEAVE TYPE
 * ============================================================
 */

export const getLeaveTypeById = async ({ companyId, leaveTypeId }) => {
  return findLeaveTypeOrFail(companyId, leaveTypeId, {
    lean: true,
  });
};

/**
 * ============================================================
 * UPDATE LEAVE TYPE
 * ============================================================
 */

export const updateLeaveType = async ({
  companyId,
  leaveTypeId,
  data,
  requesterContext,
}) => {
  const existingLeaveType = await findLeaveTypeOrFail(companyId, leaveTypeId);

  const merged = buildMergedLeaveTypeConfiguration(existingLeaveType, data);

  validateLeaveTypeConfiguration(merged);

  const normalizedName =
    data.name !== undefined ? normalizeLeaveTypeName(data.name) : undefined;

  const normalizedCode =
    data.code !== undefined ? normalizeLeaveTypeCode(data.code) : undefined;

  await validateLeaveTypeUniqueness({
    companyId,
    name: normalizedName,
    code: normalizedCode,
    excludeLeaveTypeId: leaveTypeId,
  });

  if (normalizedName !== undefined) {
    existingLeaveType.name = normalizedName;
  }

  if (normalizedCode !== undefined) {
    existingLeaveType.code = normalizedCode;
  }

  const remainingData = {
    ...data,
  };

  delete remainingData.name;
  delete remainingData.code;

  Object.assign(existingLeaveType, remainingData);

  existingLeaveType.updatedBy = requesterContext.userId ?? null;

  await existingLeaveType.save();

  return existingLeaveType;
};
