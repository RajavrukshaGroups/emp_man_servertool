import mongoose from "mongoose";

import AttendanceLocation from "./attendanceLocation.model.js";
import Client from "../clients/client.model.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * CREATE ATTENDANCE LOCATION
 * ============================================================
 */

export const createAttendanceLocation = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let createdLocation = null;

  try {
    await session.withTransaction(async () => {
      /**
       * CLIENT VALIDATION
       *
       * Only relevant when clientId is supplied.
       *
       * This ensures:
       * - client exists
       * - client belongs to this company
       * - client is active
       * - client is not deleted
       */
      if (data.clientId) {
        const client = await Client.findOne({
          _id: data.clientId,
          companyId,
          status: "ACTIVE",
          isDeleted: false,
        }).session(session);

        if (!client) {
          throw new ApiError(
            400,
            "Selected client is invalid, inactive, or does not belong to this company.",
          );
        }
      }

      /**
       * CLIENT_SITE must always contain a client.
       */
      if (data.locationType === "CLIENT_SITE" && !data.clientId) {
        throw new ApiError(
          400,
          "clientId is required for CLIENT_SITE attendance locations.",
        );
      }

      /**
       * Non-client locations should not retain a clientId.
       */
      if (data.locationType && data.locationType !== "CLIENT_SITE") {
        data.clientId = null;
      }

      /**
       * If this becomes the default location,
       * unset any existing company default.
       */
      if (data.isDefault === true) {
        await AttendanceLocation.updateMany(
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
          {
            session,
          },
        );
      }

      /**
       * Create location.
       */
      const [location] = await AttendanceLocation.create(
        [
          {
            companyId,

            ...data,

            createdBy: requesterContext.userId ?? null,

            updatedBy: requesterContext.userId ?? null,
          },
        ],
        {
          session,
        },
      );

      createdLocation = location;
    });

    return createdLocation;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * LIST ATTENDANCE LOCATIONS
 * ============================================================
 */

export const listAttendanceLocations = async ({ companyId, query }) => {
  const {
    page = 1,
    limit = 20,
    status,
    locationType,
    clientId,
    isDefault,
    effectiveOn,
    search,
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  /**
   * STATUS FILTER
   */
  if (status) {
    filter.status = status;
  }

  /**
   * LOCATION TYPE FILTER
   */
  if (locationType) {
    filter.locationType = locationType;
  }

  /**
   * CLIENT FILTER
   */
  if (clientId) {
    filter.clientId = clientId;
  }

  /**
   * DEFAULT FILTER
   */
  if (typeof isDefault === "boolean") {
    filter.isDefault = isDefault;
  }

  /**
   * SEARCH
   */
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

  /**
   * EFFECTIVE-DATE FILTER
   */
  if (effectiveOn) {
    const effectiveDate = new Date(`${effectiveOn}T00:00:00.000Z`);

    filter.$and = [
      {
        $or: [
          {
            effectiveFrom: null,
          },
          {
            effectiveFrom: {
              $lte: effectiveDate,
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
              $gte: effectiveDate,
            },
          },
        ],
      },
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AttendanceLocation.find(filter)
      .populate({
        path: "clientId",
        select: "name code clientType engagementType status",
      })
      .sort({
        isDefault: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    AttendanceLocation.countDocuments(filter),
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
 * GET ATTENDANCE LOCATION BY ID
 * ============================================================
 */

export const getAttendanceLocationById = async ({ companyId, locationId }) => {
  const location = await AttendanceLocation.findOne({
    _id: locationId,
    companyId,
    isDeleted: false,
  })
    .populate({
      path: "clientId",
      select: "name code clientType engagementType status",
    })
    .lean();

  if (!location) {
    throw new ApiError(404, "Attendance location not found.");
  }

  return location;
};

/**
 * ============================================================
 * UPDATE ATTENDANCE LOCATION
 * ============================================================
 */

export const updateAttendanceLocation = async ({
  companyId,
  locationId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedLocation = null;

  try {
    await session.withTransaction(async () => {
      /**
       * Resolve existing location.
       */
      const location = await AttendanceLocation.findOne({
        _id: locationId,
        companyId,
        isDeleted: false,
      }).session(session);

      if (!location) {
        throw new ApiError(404, "Attendance location not found.");
      }

      /**
       * Merge important related values so PATCH requests
       * are validated against existing persisted state.
       */
      const merged = {
        locationType: data.locationType ?? location.locationType,

        clientId:
          data.clientId !== undefined ? data.clientId : location.clientId,

        effectiveFrom:
          data.effectiveFrom !== undefined
            ? data.effectiveFrom
            : location.effectiveFrom,

        effectiveTo:
          data.effectiveTo !== undefined
            ? data.effectiveTo
            : location.effectiveTo,
      };

      /**
       * CLIENT_SITE must have clientId.
       */
      if (merged.locationType === "CLIENT_SITE" && !merged.clientId) {
        throw new ApiError(
          400,
          "clientId is required for CLIENT_SITE attendance locations.",
        );
      }

      /**
       * If location is not CLIENT_SITE,
       * clientId must be removed.
       */
      if (merged.locationType !== "CLIENT_SITE") {
        data.clientId = null;
        merged.clientId = null;
      }

      /**
       * Validate client if the final location
       * state is CLIENT_SITE.
       */
      if (merged.locationType === "CLIENT_SITE" && merged.clientId) {
        const client = await Client.findOne({
          _id: merged.clientId,
          companyId,
          status: "ACTIVE",
          isDeleted: false,
        }).session(session);

        if (!client) {
          throw new ApiError(
            400,
            "Selected client is invalid, inactive, or does not belong to this company.",
          );
        }
      }

      /**
       * Validate effective dates.
       */
      if (
        merged.effectiveFrom &&
        merged.effectiveTo &&
        new Date(merged.effectiveTo) < new Date(merged.effectiveFrom)
      ) {
        throw new ApiError(
          400,
          "Location effective-to cannot be earlier than effective-from.",
        );
      }

      /**
       * If this becomes default,
       * unset existing default locations.
       */
      if (data.isDefault === true) {
        await AttendanceLocation.updateMany(
          {
            companyId,

            _id: {
              $ne: locationId,
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
          {
            session,
          },
        );
      }

      /**
       * Apply requested updates.
       */
      Object.assign(location, data);

      location.updatedBy = requesterContext.userId ?? null;

      await location.save({
        session,
      });

      updatedLocation = location;
    });

    /**
     * Return populated version so the API response
     * is consistent with GET/list endpoints.
     */
    return AttendanceLocation.findOne({
      _id: updatedLocation._id,
      companyId,
      isDeleted: false,
    }).populate({
      path: "clientId",
      select: "name code clientType engagementType status",
    });
  } finally {
    await session.endSession();
  }
};
