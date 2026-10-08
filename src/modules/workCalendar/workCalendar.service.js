import mongoose from "mongoose";

import WorkCalendar from "./workCalendar.model.js";
import WorkCalendarDay from "./workCalendarDay.model.js";

import Company from "../companies/company.model.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const HOLIDAY_TYPES = new Set([
  "PUBLIC_HOLIDAY",
  "COMPANY_HOLIDAY",
  "FESTIVAL_HOLIDAY",
  "SPECIAL_HOLIDAY",
]);

/**
 * ============================================================
 * DATE HELPERS
 * ============================================================
 */

/**
 * Convert YYYY-MM-DD into a deterministic UTC date.
 *
 * We intentionally do NOT use:
 *
 * new Date("2026-10-11").getDay()
 *
 * throughout the service because calendar decisions must be
 * based on the logical YYYY-MM-DD date and must not drift due
 * to server timezone.
 */
const parseLogicalDate = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Date must use YYYY-MM-DD format.");
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  /**
   * Protect against impossible dates such as 2026-02-31.
   */
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ApiError(400, "Invalid calendar date.");
  }

  return parsed;
};

const formatLogicalDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * WorkCalendar effective dates are stored as Date values.
 *
 * Convert the logical company date to UTC midnight for
 * effective-range comparison.
 */
const getEffectiveDate = (date) => parseLogicalDate(date);

/**
 * ============================================================
 * COMPANY
 * ============================================================
 */

const resolveCalendarCompany = async (companyId, session = null) => {
  let query = Company.findOne({
    _id: companyId,
    isDeleted: false,
  }).select("_id name code status timezone");

  if (session) {
    query = query.session(session);
  }

  const company = await query.lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (company.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Work calendar operations are not allowed for an inactive company.",
    );
  }

  return company;
};

/**
 * ============================================================
 * RESOLVE APPLICABLE WORK CALENDAR
 * ============================================================
 */

export const resolveApplicableWorkCalendar = async ({
  companyId,
  date,
  session = null,
}) => {
  const effectiveDate = getEffectiveDate(date);

  const filter = {
    companyId,

    status: "ACTIVE",

    isDeleted: false,

    isDefault: true,

    effectiveFrom: {
      $lte: effectiveDate,
    },

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
  };

  let query = WorkCalendar.findOne(filter).sort({
    effectiveFrom: -1,
    createdAt: -1,
  });

  if (session) {
    query = query.session(session);
  }

  const calendar = await query.lean();

  if (!calendar) {
    throw new ApiError(
      409,
      `No active default work calendar is configured for ${date}.`,
    );
  }

  return calendar;
};

/**
 * ============================================================
 * RESOLVE WORK DAY
 * ============================================================
 *
 * THIS IS THE SHARED SOURCE OF TRUTH.
 *
 * Used later by:
 *
 * Leave
 * Attendance
 * Payroll
 *
 * Precedence:
 *
 * 1. Date-specific WORKING_DAY_OVERRIDE
 * 2. Date-specific holiday
 * 3. Recurring weekly-off rule
 * 4. Normal working day
 */

export const resolveWorkDay = async ({ companyId, date, session = null }) => {
  await resolveCalendarCompany(companyId, session);

  const logicalDate = parseLogicalDate(date);

  const calendar = await resolveApplicableWorkCalendar({
    companyId,
    date,
    session,
  });

  let dayQuery = WorkCalendarDay.findOne({
    companyId,

    workCalendarId: calendar._id,

    date,

    status: "ACTIVE",

    isDeleted: false,
  });

  if (session) {
    dayQuery = dayQuery.session(session);
  }

  const calendarDay = await dayQuery.lean();

  /**
   * ========================================================
   * DATE-SPECIFIC OVERRIDE
   * ========================================================
   */

  if (calendarDay) {
    if (calendarDay.type === "WORKING_DAY_OVERRIDE") {
      return {
        date,

        isWorkingDay: true,

        classification: "WORKING_DAY",

        source: "WORKING_DAY_OVERRIDE",

        holidayType: null,

        name: calendarDay.name || null,

        workCalendarId: calendar._id,

        workCalendarDayId: calendarDay._id,
      };
    }

    if (HOLIDAY_TYPES.has(calendarDay.type)) {
      return {
        date,

        isWorkingDay: false,

        classification: "HOLIDAY",

        source: "CALENDAR_DAY",

        holidayType: calendarDay.type,

        name: calendarDay.name || null,

        workCalendarId: calendar._id,

        workCalendarDayId: calendarDay._id,
      };
    }
  }

  /**
   * ========================================================
   * RECURRING WEEKLY OFF
   * ========================================================
   */

  const dayOfWeek = logicalDate.getUTCDay();

  const weeklyOffDays = Array.isArray(calendar.weeklyOffDays)
    ? calendar.weeklyOffDays
    : [];

  if (weeklyOffDays.includes(dayOfWeek)) {
    return {
      date,

      isWorkingDay: false,

      classification: "WEEKLY_OFF",

      source: "WEEKLY_RULE",

      holidayType: null,

      name: "Weekly Off",

      workCalendarId: calendar._id,

      workCalendarDayId: null,
    };
  }

  /**
   * ========================================================
   * NORMAL WORKING DAY
   * ========================================================
   */

  return {
    date,

    isWorkingDay: true,

    classification: "WORKING_DAY",

    source: "WEEKLY_RULE",

    holidayType: null,

    name: null,

    workCalendarId: calendar._id,

    workCalendarDayId: null,
  };
};

/**
 * ============================================================
 * RESOLVE DATE RANGE
 * ============================================================
 */

export const resolveWorkCalendarRange = async ({
  companyId,
  fromDate,
  toDate,
}) => {
  await resolveCalendarCompany(companyId);

  const start = parseLogicalDate(fromDate);
  const end = parseLogicalDate(toDate);

  if (end < start) {
    throw new ApiError(400, "toDate cannot be earlier than fromDate.");
  }

  /**
   * Safety guard.
   *
   * Prevent accidental requests for extremely large ranges.
   */
  const totalDays =
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  if (totalDays > 366) {
    throw new ApiError(400, "Work calendar range cannot exceed 366 days.");
  }

  const days = [];

  const cursor = new Date(start);

  while (cursor <= end) {
    const date = formatLogicalDate(cursor);

    const resolved = await resolveWorkDay({
      companyId,
      date,
    });

    days.push(resolved);

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    companyId,

    fromDate,

    toDate,

    totalDays: days.length,

    workingDays: days.filter((day) => day.isWorkingDay).length,

    nonWorkingDays: days.filter((day) => !day.isWorkingDay).length,

    days,
  };
};

/**
 * ============================================================
 * CREATE WORK CALENDAR
 * ============================================================
 */

export const createWorkCalendar = async ({
  companyId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let createdCalendar = null;

  try {
    await session.withTransaction(async () => {
      await resolveCalendarCompany(companyId, session);

      /**
       * Only one default calendar should be marked as default
       * for the company at a time.
       *
       * Effective-period validation can become more granular
       * later when location/shift calendars are introduced.
       */
      if (data.isDefault === true) {
        await WorkCalendar.updateMany(
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

      const [calendar] = await WorkCalendar.create(
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

      createdCalendar = calendar;
    });

    return createdCalendar;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        409,
        "A work calendar with this code already exists for the company.",
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * LIST WORK CALENDARS
 * ============================================================
 */

export const listWorkCalendars = async ({ companyId, query = {} }) => {
  await resolveCalendarCompany(companyId);

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
    const effectiveDate = getEffectiveDate(effectiveOn);

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
    WorkCalendar.find(filter)
      .sort({
        isDefault: -1,
        effectiveFrom: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    WorkCalendar.countDocuments(filter),
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
 * GET WORK CALENDAR
 * ============================================================
 */

export const getWorkCalendarById = async ({ companyId, calendarId }) => {
  await resolveCalendarCompany(companyId);

  const calendar = await WorkCalendar.findOne({
    _id: calendarId,

    companyId,

    isDeleted: false,
  }).lean();

  if (!calendar) {
    throw new ApiError(404, "Work calendar not found.");
  }

  return calendar;
};

/**
 * ============================================================
 * UPDATE WORK CALENDAR
 * ============================================================
 */

export const updateWorkCalendar = async ({
  companyId,
  calendarId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedCalendar = null;

  try {
    await session.withTransaction(async () => {
      await resolveCalendarCompany(companyId, session);

      const calendar = await WorkCalendar.findOne({
        _id: calendarId,

        companyId,

        isDeleted: false,
      }).session(session);

      if (!calendar) {
        throw new ApiError(404, "Work calendar not found.");
      }

      /**
       * Validate existing + incoming effective dates together.
       */
      const effectiveFrom =
        data.effectiveFrom !== undefined
          ? new Date(data.effectiveFrom)
          : calendar.effectiveFrom;

      const effectiveTo =
        data.effectiveTo !== undefined
          ? data.effectiveTo
            ? new Date(data.effectiveTo)
            : null
          : calendar.effectiveTo;

      if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
        throw new ApiError(
          400,
          "Calendar effective-to cannot be earlier than effective-from.",
        );
      }

      if (data.isDefault === true) {
        await WorkCalendar.updateMany(
          {
            companyId,

            _id: {
              $ne: calendarId,
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

      Object.assign(calendar, data);

      calendar.updatedBy = requesterContext.userId ?? null;

      await calendar.save({
        session,
      });

      updatedCalendar = calendar;
    });

    return updatedCalendar;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        409,
        "A work calendar with this code already exists for the company.",
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * CREATE WORK CALENDAR DAY
 * ============================================================
 */

export const createWorkCalendarDay = async ({
  companyId,
  calendarId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let createdDay = null;

  try {
    await session.withTransaction(async () => {
      await resolveCalendarCompany(companyId, session);

      const calendar = await WorkCalendar.findOne({
        _id: calendarId,

        companyId,

        isDeleted: false,
      }).session(session);

      if (!calendar) {
        throw new ApiError(404, "Work calendar not found.");
      }

      /**
       * Validate the logical date before persisting.
       */
      parseLogicalDate(data.date);

      const [calendarDay] = await WorkCalendarDay.create(
        [
          {
            companyId,

            workCalendarId: calendar._id,

            ...data,

            createdBy: requesterContext.userId ?? null,

            updatedBy: requesterContext.userId ?? null,
          },
        ],
        {
          session,
        },
      );

      createdDay = calendarDay;
    });

    return createdDay;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "A calendar entry already exists for this date.");
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * ============================================================
 * LIST WORK CALENDAR DAYS
 * ============================================================
 */

export const listWorkCalendarDays = async ({
  companyId,
  calendarId,
  query = {},
}) => {
  await resolveCalendarCompany(companyId);

  const calendar = await WorkCalendar.findOne({
    _id: calendarId,

    companyId,

    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!calendar) {
    throw new ApiError(404, "Work calendar not found.");
  }

  const {
    page = 1,
    limit = 20,
    status,
    type,
    date,
    fromDate,
    toDate,
    search,
  } = query;

  const filter = {
    companyId,

    workCalendarId: calendarId,

    isDeleted: false,
  };

  if (status) {
    filter.status = status;
  }

  if (type) {
    filter.type = type;
  }

  if (date) {
    filter.date = date;
  } else if (fromDate || toDate) {
    filter.date = {};

    if (fromDate) {
      filter.date.$gte = fromDate;
    }

    if (toDate) {
      filter.date.$lte = toDate;
    }
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
        description: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    WorkCalendarDay.find(filter)
      .sort({
        date: 1,
        createdAt: 1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    WorkCalendarDay.countDocuments(filter),
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
 * GET WORK CALENDAR DAY
 * ============================================================
 */

export const getWorkCalendarDayById = async ({
  companyId,
  calendarId,
  calendarDayId,
}) => {
  await resolveCalendarCompany(companyId);

  const calendarDay = await WorkCalendarDay.findOne({
    _id: calendarDayId,

    companyId,

    workCalendarId: calendarId,

    isDeleted: false,
  }).lean();

  if (!calendarDay) {
    throw new ApiError(404, "Work calendar day not found.");
  }

  return calendarDay;
};

/**
 * ============================================================
 * UPDATE WORK CALENDAR DAY
 * ============================================================
 */

export const updateWorkCalendarDay = async ({
  companyId,
  calendarId,
  calendarDayId,
  data,
  requesterContext,
}) => {
  const session = await mongoose.startSession();

  let updatedDay = null;

  try {
    await session.withTransaction(async () => {
      await resolveCalendarCompany(companyId, session);

      const calendarDay = await WorkCalendarDay.findOne({
        _id: calendarDayId,

        companyId,

        workCalendarId: calendarId,

        isDeleted: false,
      }).session(session);

      if (!calendarDay) {
        throw new ApiError(404, "Work calendar day not found.");
      }

      if (data.date) {
        parseLogicalDate(data.date);
      }

      Object.assign(calendarDay, data);

      calendarDay.updatedBy = requesterContext.userId ?? null;

      await calendarDay.save({
        session,
      });

      updatedDay = calendarDay;
    });

    return updatedDay;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "A calendar entry already exists for this date.");
    }

    throw error;
  } finally {
    await session.endSession();
  }
};
