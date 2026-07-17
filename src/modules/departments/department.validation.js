import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const departmentNameSchema = z
  .string()
  .trim()
  .min(2, "Department name must contain at least 2 characters.")
  .max(100, "Department name cannot exceed 100 characters.");

const departmentCodeSchema = z
  .string()
  .trim()
  .min(2, "Department code must contain at least 2 characters.")
  .max(20, "Department code cannot exceed 20 characters.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Department code can contain only letters, numbers, hyphens and underscores.",
  );

const nullableObjectIdSchema = z.union([objectIdSchema, z.null()]);

const booleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const positiveIntegerQuerySchema = z
  .string()
  .regex(/^\d+$/, "Must be a positive integer.")
  .transform(Number)
  .refine((value) => value >= 1, "Must be at least 1.");

export const createDepartmentSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      name: departmentNameSchema,

      code: departmentCodeSchema,

      description: z
        .string()
        .trim()
        .max(1000, "Department description cannot exceed 1000 characters.")
        .default(""),

      departmentHeadId: nullableObjectIdSchema.optional().default(null),

      parentDepartmentId: nullableObjectIdSchema.optional().default(null),

      status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const listDepartmentsSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z
    .object({
      page: positiveIntegerQuerySchema.default("1"),

      limit: positiveIntegerQuerySchema
        .default("10")
        .refine((value) => value <= 100, "Limit cannot exceed 100."),

      search: z
        .string()
        .trim()
        .max(100, "Search cannot exceed 100 characters.")
        .optional(),

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      departmentHeadId: objectIdSchema.optional(),

      parentDepartmentId: objectIdSchema.optional(),

      hasParent: booleanQuerySchema.optional(),

      sortBy: z
        .enum(["name", "code", "status", "createdAt", "updatedAt"])
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),

  body: z.object({}).strict().optional(),
});

export const getDepartmentByIdSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
      departmentId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),
});

export const updateDepartmentSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
      departmentId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      name: departmentNameSchema.optional(),

      code: departmentCodeSchema.optional(),

      description: z
        .string()
        .trim()
        .max(1000, "Department description cannot exceed 1000 characters.")
        .optional(),

      departmentHeadId: nullableObjectIdSchema.optional(),

      parentDepartmentId: nullableObjectIdSchema.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one department field must be provided for update.",
    }),

  query: z.object({}).strict().optional(),
});

export const updateDepartmentStatusSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
      departmentId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      status: z.enum(["ACTIVE", "INACTIVE"]),
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const deleteDepartmentSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
      departmentId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),
});
