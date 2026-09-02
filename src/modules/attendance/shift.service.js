import mongoose from "mongoose";

import Shift from "./shift.model.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * CREATE SHIFT
 * ============================================================
 */

export const createShift = async ({ companyId, data, requesterContext }) => {
  const existingShift = await Shift.findOne({
    companyId,
    code: data.code.toUpperCase(),
    isDeleted: false,
  });

  if (existingShift) {
    throw new ApiError(
      409,
      "A shift with this code already exists for this company.",
    );
  }

  const shift = await Shift.create({
    companyId,
    ...data,
    createdBy: requesterContext.userId ?? null,
    updatedBy: requesterContext.userId ?? null,
  });

  return shift;
};

/**
 * ============================================================
 * LIST SHIFTS
 * ============================================================
 */

export const listShifts = async ({ companyId, query }) => {
  const { page = 1, limit = 20, status, search, effectiveOn } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (status) {
    filter.status = status;
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
          { effectiveTo: null },
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
    Shift.find(filter)
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Shift.countDocuments(filter),
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
 * GET SHIFT
 * ============================================================
 */

export const getShiftById = async ({ companyId, shiftId }) => {
  const shift = await Shift.findOne({
    _id: shiftId,
    companyId,
    isDeleted: false,
  }).lean();

  if (!shift) {
    throw new ApiError(404, "Attendance shift not found.");
  }

  return shift;
};

/**
 * ============================================================
 * UPDATE SHIFT
 * ============================================================
 */

export const updateShift = async ({
  companyId,
  shiftId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedShift;

  try {
    await session.withTransaction(async () => {
      const shift = await Shift.findOne({
        _id: shiftId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!shift) {
        throw new ApiError(404, "Attendance shift not found.");
      }

      if (data.code) {
        const duplicate = await Shift.findOne({
          companyId,
          code: data.code.toUpperCase(),
          _id: {
            $ne: shiftId,
          },
          isDeleted: false,
        }).session(session);

        if (duplicate) {
          throw new ApiError(
            409,
            "A shift with this code already exists for this company.",
          );
        }
      }

      /**
       * PATCH validation also needs to consider existing
       * values when only one related field is changed.
       */
      const merged = {
        fullDayMinutes: data.fullDayMinutes ?? shift.fullDayMinutes,

        halfDayMinutes: data.halfDayMinutes ?? shift.halfDayMinutes,

        standardBreakMinutes:
          data.standardBreakMinutes ?? shift.standardBreakMinutes,

        maxBreakMinutes: data.maxBreakMinutes ?? shift.maxBreakMinutes,

        effectiveFrom:
          data.effectiveFrom !== undefined
            ? data.effectiveFrom
            : shift.effectiveFrom,

        effectiveTo:
          data.effectiveTo !== undefined ? data.effectiveTo : shift.effectiveTo,
      };

      if (merged.halfDayMinutes > merged.fullDayMinutes) {
        throw new ApiError(
          400,
          "Half-day minutes cannot exceed full-day minutes.",
        );
      }

      if (merged.maxBreakMinutes < merged.standardBreakMinutes) {
        throw new ApiError(
          400,
          "Maximum break minutes cannot be below standard break minutes.",
        );
      }

      if (
        merged.effectiveFrom &&
        merged.effectiveTo &&
        new Date(merged.effectiveTo) < new Date(merged.effectiveFrom)
      ) {
        throw new ApiError(
          400,
          "Shift effective-to cannot be earlier than effective-from.",
        );
      }

      Object.assign(shift, data);

      shift.updatedBy = requesterContext.userId ?? null;

      await shift.save({ session });

      updatedShift = shift;
    });

    return updatedShift;
  } finally {
    await session.endSession();
  }
};
