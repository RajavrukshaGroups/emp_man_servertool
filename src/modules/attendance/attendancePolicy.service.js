import mongoose from "mongoose";

import AttendancePolicy from "./attendancePolicy.model.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * CREATE ATTENDANCE POLICY
 * ============================================================
 */

export const createAttendancePolicy = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let createdPolicy = null;

  try {
    await session.withTransaction(async () => {
      /**
       * If this policy is being created as default,
       * unset existing default policies first.
       */
      if (data.isDefault === true) {
        await AttendancePolicy.updateMany(
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

      const [policy] = await AttendancePolicy.create(
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
 * LIST ATTENDANCE POLICIES
 * ============================================================
 */

export const listAttendancePolicies = async ({ companyId, query }) => {
  const {
    page = 1,
    limit = 20,
    status,
    isDefault,
    effectiveOn,
    search,
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (typeof isDefault === "boolean") {
    filter.isDefault = isDefault;
  }

  if (search) {
    filter.$or = [
      {
        name: {
          $regex: search,
          $options: "i",
        },
      },
      {
        code: {
          $regex: search,
          $options: "i",
        },
      },
      {
        description: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  if (effectiveOn) {
    const effectiveDate = new Date(`${effectiveOn}T00:00:00.000Z`);

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

  const [items, total] = await Promise.all([
    AttendancePolicy.find(filter)
      .sort({
        isDefault: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    AttendancePolicy.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * ============================================================
 * GET POLICY
 * ============================================================
 */

export const getAttendancePolicyById = async ({ companyId, policyId }) => {
  const policy = await AttendancePolicy.findOne({
    _id: policyId,
    companyId,
    isDeleted: false,
  }).lean();

  if (!policy) {
    throw new ApiError(404, "Attendance policy not found.");
  }

  return policy;
};

/**
 * ============================================================
 * UPDATE POLICY
 * ============================================================
 */

export const updateAttendancePolicy = async ({
  companyId,
  policyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedPolicy = null;

  try {
    await session.withTransaction(async () => {
      const existingPolicy = await AttendancePolicy.findOne({
        _id: policyId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!existingPolicy) {
        throw new ApiError(404, "Attendance policy not found.");
      }

      /**
       * Protect business rules on PATCH by validating
       * existing + incoming values together.
       */
      const merged = {
        missingCheckoutAction:
          data.missingCheckoutAction ?? existingPolicy.missingCheckoutAction,

        autoCloseAfterMinutes:
          data.autoCloseAfterMinutes ?? existingPolicy.autoCloseAfterMinutes,

        maximumOpenSessionMinutes:
          data.maximumOpenSessionMinutes ??
          existingPolicy.maximumOpenSessionMinutes,

        effectiveFrom: data.effectiveFrom ?? existingPolicy.effectiveFrom,

        effectiveTo:
          data.effectiveTo !== undefined
            ? data.effectiveTo
            : existingPolicy.effectiveTo,
      };

      if (
        merged.effectiveFrom &&
        merged.effectiveTo &&
        new Date(merged.effectiveTo) < new Date(merged.effectiveFrom)
      ) {
        throw new ApiError(
          400,
          "Policy effective-to cannot be earlier than effective-from.",
        );
      }

      if (
        merged.missingCheckoutAction === "AUTO_CLOSE" &&
        merged.maximumOpenSessionMinutes < merged.autoCloseAfterMinutes
      ) {
        throw new ApiError(
          400,
          "Maximum open session minutes cannot be below auto-close minutes.",
        );
      }

      /**
       * If this policy becomes default,
       * remove default status from others.
       */
      if (data.isDefault === true) {
        await AttendancePolicy.updateMany(
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
