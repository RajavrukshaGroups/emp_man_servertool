import { z } from "zod";

/**
 * ============================================================
 * COMMON
 * ============================================================
 */

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.");

const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const emptyBodySchema = z.object({}).strict().optional();

const emptyQuerySchema = z.object({}).strict().optional();

/**
 * ============================================================
 * ROUTE PARAMS
 * ============================================================
 */

export const workCalendarCompanyParamsSchema = z
  .object({
    companyId: objectIdSchema,
  })
  .strict();

export const workCalendarIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    calendarId: objectIdSchema,
  })
  .strict();

export const workCalendarDayIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    calendarId: objectIdSchema,

    calendarDayId: objectIdSchema,
  })
  .strict();

/**
 * ============================================================
 * WORK CALENDAR
 * ============================================================
 */

const workCalendarBaseSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Calendar code may contain letters, numbers, underscores and hyphens only.",
      )
      .transform((value) => value.toUpperCase()),

    description: z.string().trim().max(500).optional().default(""),

    /**
     * JavaScript day numbering:
     *
     * 0 = Sunday
     * 1 = Monday
     * ...
     * 6 = Saturday
     */
    weeklyOffDays: z
      .array(z.number().int().min(0).max(6))
      .refine(
        (days) => new Set(days).size === days.length,
        "Weekly-off days must be unique.",
      )
      .default([0]),

    effectiveFrom: dateStringSchema,

    effectiveTo: dateStringSchema.optional().nullable(),
    isDefault: z.boolean().default(false),

    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

/**
 * Rules that depend on multiple WorkCalendar fields.
 */
const validateWorkCalendarBusinessRules = (data, ctx) => {
  if (
    data.effectiveFrom &&
    data.effectiveTo &&
    new Date(data.effectiveTo) < new Date(data.effectiveFrom)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Calendar effective-to cannot be earlier than effective-from.",
    });
  }
};

const workCalendarBodySchema = workCalendarBaseSchema.superRefine(
  validateWorkCalendarBusinessRules,
);

const updateWorkCalendarBodySchema = workCalendarBaseSchema
  .partial()
  .refine(
    (body) => Object.keys(body).length > 0,
    "At least one work calendar field must be provided.",
  )
  .superRefine(validateWorkCalendarBusinessRules);

export const createWorkCalendarSchema = z.object({
  params: workCalendarCompanyParamsSchema,

  body: workCalendarBodySchema,

  query: emptyQuerySchema,
});

export const updateWorkCalendarSchema = z.object({
  params: workCalendarIdParamsSchema,

  body: updateWorkCalendarBodySchema,

  query: emptyQuerySchema,
});

export const listWorkCalendarsSchema = z.object({
  params: workCalendarCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      isDefault: z.coerce.boolean().optional(),

      effectiveOn: dateStringSchema.optional(),

      search: z.string().trim().max(150).optional(),
    })
    .strict(),

  body: emptyBodySchema,
});

export const getWorkCalendarSchema = z.object({
  params: workCalendarIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * WORK CALENDAR DAY
 * ============================================================
 */

const workCalendarDayTypeSchema = z.enum([
  "PUBLIC_HOLIDAY",
  "COMPANY_HOLIDAY",
  "FESTIVAL_HOLIDAY",
  "SPECIAL_HOLIDAY",
  "WORKING_DAY_OVERRIDE",
]);

/**
 * IMPORTANT:
 *
 * `isWorkingDay` is intentionally NOT accepted from the client.
 *
 * Backend/model derives it:
 *
 * WORKING_DAY_OVERRIDE => true
 * Holiday types        => false
 */
const workCalendarDayBaseSchema = z
  .object({
    date: dateStringSchema,

    type: workCalendarDayTypeSchema,

    name: z.string().trim().min(2).max(150),

    description: z.string().trim().max(1000).optional().default(""),

    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

const updateWorkCalendarDayBodySchema = workCalendarDayBaseSchema
  .partial()
  .refine(
    (body) => Object.keys(body).length > 0,
    "At least one calendar day field must be provided.",
  );

export const createWorkCalendarDaySchema = z.object({
  params: workCalendarIdParamsSchema,

  body: workCalendarDayBaseSchema,

  query: emptyQuerySchema,
});

export const updateWorkCalendarDaySchema = z.object({
  params: workCalendarDayIdParamsSchema,

  body: updateWorkCalendarDayBodySchema,

  query: emptyQuerySchema,
});

export const listWorkCalendarDaysSchema = z.object({
  params: workCalendarIdParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      type: workCalendarDayTypeSchema.optional(),

      date: dateStringSchema.optional(),

      fromDate: dateStringSchema.optional(),

      toDate: dateStringSchema.optional(),

      search: z.string().trim().max(150).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});

export const getWorkCalendarDaySchema = z.object({
  params: workCalendarDayIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * RESOLVE CALENDAR DATE
 * ============================================================
 *
 * Used by:
 *
 * - Work Calendar frontend
 * - Leave
 * - Attendance
 *
 * Example:
 *
 * GET /companies/:companyId/work-calendars/resolve?date=2026-10-11
 */
export const resolveWorkCalendarDateSchema = z.object({
  params: workCalendarCompanyParamsSchema,

  query: z
    .object({
      date: dateStringSchema,
    })
    .strict(),

  body: emptyBodySchema,
});

/**
 * ============================================================
 * CALENDAR RANGE
 * ============================================================
 *
 * Useful for frontend monthly/yearly calendar rendering.
 */
export const getWorkCalendarRangeSchema = z.object({
  params: workCalendarCompanyParamsSchema,

  query: z
    .object({
      fromDate: dateStringSchema,

      toDate: dateStringSchema,
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});
