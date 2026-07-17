import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const optionalText = (maximumLength) =>
  z
    .string()
    .trim()
    .max(maximumLength, `Text cannot exceed ${maximumLength} characters.`)
    .optional()
    .or(z.literal(""));

const roleNameSchema = z
  .string()
  .trim()
  .min(2, "Role name must contain at least 2 characters.")
  .max(100, "Role name cannot exceed 100 characters.");

const roleCodeSchema = z
  .string()
  .trim()
  .min(2, "Role code must contain at least 2 characters.")
  .max(50, "Role code cannot exceed 50 characters.")
  .regex(
    /^[A-Za-z0-9_]+$/,
    "Role code may contain only letters, numbers and underscores.",
  )
  .transform((value) => value.toUpperCase());

const permissionIdsSchema = z
  .array(objectIdSchema)
  .max(200, "A role cannot contain more than 200 permissions.")
  .transform((permissionIds) => [...new Set(permissionIds)]);

/**
 * POST /companies/:companyId/roles
 */
export const createRoleSchema = z.object({
  body: z
    .object({
      name: roleNameSchema,

      code: roleCodeSchema,

      description: optionalText(500),

      permissionIds: permissionIdsSchema.default([]),

      scopeType: z.literal("COMPANY").default("COMPANY"),

      isSystemRole: z.boolean().default(false),

      isEditable: z.boolean().default(true),

      status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
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
 * PATCH /companies/:companyId/roles/:roleId
 */
export const updateRoleSchema = z.object({
  body: z
    .object({
      name: roleNameSchema.optional(),

      code: roleCodeSchema.optional(),

      description: optionalText(500),

      permissionIds: permissionIdsSchema.optional(),

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field is required for update.",
    }),

  params: z
    .object({
      companyId: objectIdSchema,
      roleId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * GET /companies/:companyId/roles/:roleId
 * DELETE /companies/:companyId/roles/:roleId
 */
export const roleIdParamSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      companyId: objectIdSchema,
      roleId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/roles/:roleId/status
 */
export const roleStatusSchema = z.object({
  body: z
    .object({
      status: z.enum(["ACTIVE", "INACTIVE"]),
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
      roleId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * PATCH /companies/:companyId/roles/:roleId/permissions
 */
export const updateRolePermissionsSchema = z.object({
  body: z
    .object({
      permissionIds: permissionIdsSchema,
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
      roleId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

/**
 * GET /companies/:companyId/roles
 */
export const listRolesSchema = z.object({
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

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      scopeType: z.literal("COMPANY").optional(),

      isSystemRole: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

      sortBy: z
        .enum(["name", "code", "status", "scopeType", "createdAt", "updatedAt"])
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),
});
