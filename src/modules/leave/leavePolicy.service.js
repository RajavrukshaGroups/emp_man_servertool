import mongoose from "mongoose";

import LeavePolicy from "./leavePolicy.model.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Validate effective date range.
 */
const validateEffectiveDateRange = ({ effectiveFrom, effectiveTo }) => {
  if (
    effectiveFrom &&
    effectiveTo &&
    new Date(effectiveTo) < new Date(effectiveFrom)
  ) {
    throw new ApiError(
      400,
      "Leave policy effective-to cannot be earlier than effective-from.",
    );
  }
};

/**
 * Ensure a leave policy exists inside the selected company.
 */
const findLeavePolicyOrFail = async (
  companyId,
  policyId,
  { session = null, lean = false } = {},
) => {
  let query = LeavePolicy.findOne({
    _id: policyId,
    companyId,
    isDeleted: false,
  });

  if (session) {
    query = query.session(session);
  }

  if (lean) {
    query = query.lean();
  }

  const policy = await query;

  if (!policy) {
    throw new ApiError(404, "Leave policy not found.");
  }

  return policy;
};

/**
 * Validate leave policy name/code uniqueness inside one company.
 */
const validateLeavePolicyUniqueness = async ({
  companyId,
  name,
  code,
  excludePolicyId = null,
  session = null,
}) => {
  const conditions = [];

  if (name) {
    conditions.push({
      name: {
        $regex: `^${escapeRegex(name.trim())}$`,
        $options: "i",
      },
    });
  }

  if (code) {
    conditions.push({
      code: code.trim().toUpperCase(),
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

  if (excludePolicyId) {
    filter._id = {
      $ne: excludePolicyId,
    };
  }

  let query = LeavePolicy.findOne(filter).select("_id name code");

  if (session) {
    query = query.session(session);
  }

  const duplicatePolicy = await query.lean();

  if (!duplicatePolicy) {
    return;
  }

  if (
    name &&
    duplicatePolicy.name.toLowerCase() === name.trim().toLowerCase()
  ) {
    throw new ApiError(
      409,
      "A leave policy with this name already exists in the company.",
    );
  }

  if (code && duplicatePolicy.code === code.trim().toUpperCase()) {
    throw new ApiError(
      409,
      "A leave policy with this code already exists in the company.",
    );
  }

  throw new ApiError(
    409,
    "A leave policy with the provided name or code already exists.",
  );
};

/**
 * ============================================================
 * CREATE LEAVE POLICY
 * ============================================================
 */

export const createLeavePolicy = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let createdPolicy = null;

  try {
    await session.withTransaction(async () => {
      validateEffectiveDateRange({
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
      });

      await validateLeavePolicyUniqueness({
        companyId,
        name: data.name,
        code: data.code,
        session,
      });

      /**
       * Only one default leave policy should exist per company.
       */
      if (data.isDefault === true) {
        await LeavePolicy.updateMany(
          {
            companyId,
            isDeleted: false,
            isDefault: true,
          },
          {
            $set: {
              isDefault: false,
              updatedBy: requesterContext.userId ?? null,
            },
          },
          { session },
        );
      }

      const [policy] = await LeavePolicy.create(
        [
          {
            companyId,

            ...data,

            createdBy: requesterContext.userId ?? null,
            updatedBy: requesterContext.userId ?? null,
          },
        ],
        { session },
      );

      createdPolicy = policy;
    });

    return createdPolicy;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * LIST LEAVE POLICIES
 * ============================================================
 */

export const listLeavePolicies = async ({ companyId, query }) => {
  const {
    page = 1,
    limit = 20,
    status,
    isDefault,
    effectiveOn,
    search,
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

  /**
   * Validation currently accepts "true"/"false" from query params.
   */
  if (isDefault !== undefined) {
    filter.isDefault =
      typeof isDefault === "boolean" ? isDefault : isDefault === "true";
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
    isDefault: -1,
    [sortBy]: sortOrder === "asc" ? 1 : -1,
    _id: 1,
  };

  const [items, total] = await Promise.all([
    LeavePolicy.find(filter).sort(sort).skip(skip).limit(limit).lean(),

    LeavePolicy.countDocuments(filter),
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
 * GET LEAVE POLICY
 * ============================================================
 */

export const getLeavePolicyById = async ({ companyId, policyId }) => {
  return findLeavePolicyOrFail(companyId, policyId, {
    lean: true,
  });
};

/**
 * ============================================================
 * UPDATE LEAVE POLICY
 * ============================================================
 */

export const updateLeavePolicy = async ({
  companyId,
  policyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedPolicy = null;

  try {
    await session.withTransaction(async () => {
      const existingPolicy = await findLeavePolicyOrFail(companyId, policyId, {
        session,
      });

      /**
       * PATCH validation must consider both the existing policy
       * and incoming fields.
       */
      const merged = {
        effectiveFrom:
          data.effectiveFrom !== undefined
            ? data.effectiveFrom
            : existingPolicy.effectiveFrom,

        effectiveTo:
          data.effectiveTo !== undefined
            ? data.effectiveTo
            : existingPolicy.effectiveTo,
      };

      validateEffectiveDateRange({
        effectiveFrom: merged.effectiveFrom,
        effectiveTo: merged.effectiveTo,
      });

      await validateLeavePolicyUniqueness({
        companyId,
        name: data.name,
        code: data.code,
        excludePolicyId: policyId,
        session,
      });

      /**
       * If this policy becomes default,
       * unset all other default policies.
       */
      if (data.isDefault === true) {
        await LeavePolicy.updateMany(
          {
            companyId,
            _id: {
              $ne: policyId,
            },
            isDeleted: false,
            isDefault: true,
          },
          {
            $set: {
              isDefault: false,
              updatedBy: requesterContext.userId ?? null,
            },
          },
          { session },
        );
      }

      Object.assign(existingPolicy, data);

      existingPolicy.updatedBy = requesterContext.userId ?? null;

      await existingPolicy.save({ session });

      updatedPolicy = existingPolicy;
    });

    return updatedPolicy;
  } finally {
    await session.endSession();
  }
};
