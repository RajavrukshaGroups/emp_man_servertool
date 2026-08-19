import { z } from "zod";

/**
 * ============================================================
 * COMMON VALIDATORS
 * ============================================================
 */

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId.");

const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);

/**
 * ============================================================
 * CREATE WORK CATEGORY
 * ============================================================
 */

export const createWorkCategorySchema = z.object({
  body: z
    .object({
      departmentId: objectIdSchema,

      teamId: objectIdSchema,

      name: z
        .string()
        .trim()
        .min(2, "Work category name must contain at least 2 characters.")
        .max(100, "Work category name cannot exceed 100 characters."),

      code: z
        .string()
        .trim()
        .min(2, "Work category code must contain at least 2 characters.")
        .max(40, "Work category code cannot exceed 40 characters.")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Work category code can contain only letters, numbers, underscores and hyphens.",
        )
        .transform((value) => value.toUpperCase()),

      description: z
        .string()
        .trim()
        .max(1000, "Work category description cannot exceed 1000 characters.")
        .optional()
        .default(""),

      unitLabel: z
        .string()
        .trim()
        .min(1, "Work category unit label must contain at least 1 character.")
        .max(50, "Work category unit label cannot exceed 50 characters.")
        .transform((value) => value.toLowerCase())
        .optional()
        .default("item"),

      workloadWeight: z.coerce
        .number()
        .min(0.1, "Workload weight must be at least 0.1.")
        .max(100, "Workload weight cannot exceed 100.")
        .optional()
        .default(1),

      status: statusSchema.optional().default("ACTIVE"),
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * UPDATE WORK CATEGORY
 * ============================================================
 */

export const updateWorkCategorySchema = z.object({
  body: z
    .object({
      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      name: z
        .string()
        .trim()
        .min(2, "Work category name must contain at least 2 characters.")
        .max(100, "Work category name cannot exceed 100 characters.")
        .optional(),

      code: z
        .string()
        .trim()
        .min(2, "Work category code must contain at least 2 characters.")
        .max(40, "Work category code cannot exceed 40 characters.")
        .regex(
          /^[A-Za-z0-9_-]+$/,
          "Work category code can contain only letters, numbers, underscores and hyphens.",
        )
        .transform((value) => value.toUpperCase())
        .optional(),

      description: z
        .string()
        .trim()
        .max(1000, "Work category description cannot exceed 1000 characters.")
        .optional(),

      unitLabel: z
        .string()
        .trim()
        .min(1, "Work category unit label must contain at least 1 character.")
        .max(50, "Work category unit label cannot exceed 50 characters.")
        .transform((value) => value.toLowerCase())
        .optional(),

      workloadWeight: z.coerce
        .number()
        .min(0.1, "Workload weight must be at least 0.1.")
        .max(100, "Workload weight cannot exceed 100.")
        .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field is required to update the work category.",
    }),

  params: z
    .object({
      companyId: objectIdSchema,
      workCategoryId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * GET / DELETE BY ID PARAM
 * ============================================================
 */

export const workCategoryIdParamSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
      workCategoryId: objectIdSchema,
    })
    .strict(),

  body: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * UPDATE STATUS
 * ============================================================
 */

export const updateWorkCategoryStatusSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
      workCategoryId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      status: statusSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * LIST WORK CATEGORIES
 * ============================================================
 */

export const listWorkCategoriesSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z
    .object({
      page: z.coerce
        .number()
        .int("Page must be an integer.")
        .min(1, "Page must be at least 1.")
        .default(1),

      limit: z.coerce
        .number()
        .int("Limit must be an integer.")
        .min(1, "Limit must be at least 1.")
        .max(100, "Limit cannot exceed 100.")
        .default(10),

      search: z
        .string()
        .trim()
        .max(100, "Search text cannot exceed 100 characters.")
        .optional(),

      status: statusSchema.optional(),

      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      sortBy: z
        .enum([
          "name",
          "code",
          "unitLabel",
          "workloadWeight",
          "status",
          "createdAt",
          "updatedAt",
        ])
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),
});
