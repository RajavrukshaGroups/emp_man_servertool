import { z } from "zod";

/**
 * MongoDB ObjectId validation.
 */
const objectIdSchema = z
  .string({
    required_error: "ID is required.",
    invalid_type_error: "ID must be a string.",
  })
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid MongoDB ObjectId.");

/**
 * Optional MongoDB ObjectId.
 *
 * Accepts:
 * - valid ObjectId
 * - null
 * - omitted value
 */
const optionalObjectIdSchema = z.union([objectIdSchema, z.null()]).optional();

/**
 * Team name validation.
 */
const teamNameSchema = z
  .string({
    required_error: "Team name is required.",
    invalid_type_error: "Team name must be a string.",
  })
  .trim()
  .min(2, "Team name must contain at least 2 characters.")
  .max(100, "Team name cannot exceed 100 characters.");

/**
 * Team code validation.
 *
 * The model will normalize the value to uppercase,
 * but request validation ensures the code contains
 * only supported characters.
 */
const teamCodeSchema = z
  .string({
    required_error: "Team code is required.",
    invalid_type_error: "Team code must be a string.",
  })
  .trim()
  .min(2, "Team code must contain at least 2 characters.")
  .max(20, "Team code cannot exceed 20 characters.")
  .regex(
    /^[a-zA-Z0-9 _-]+$/,
    "Team code can contain only letters, numbers, spaces, hyphens and underscores.",
  );

/**
 * Team description validation.
 */
const teamDescriptionSchema = z
  .string({
    invalid_type_error: "Team description must be a string.",
  })
  .trim()
  .max(1000, "Team description cannot exceed 1000 characters.");

/**
 * Team status validation.
 */
const teamStatusSchema = z.enum(["ACTIVE", "INACTIVE"], {
  required_error: "Team status is required.",
  invalid_type_error: "Team status must be ACTIVE or INACTIVE.",
});

/**
 * Array of unique CompanyAccess IDs.
 */
const uniqueCompanyAccessIdsSchema = z
  .array(objectIdSchema, {
    invalid_type_error: "Company access IDs must be provided as an array.",
  })
  .max(50, "A maximum of 50 company access IDs can be provided.")
  .refine(
    (ids) => new Set(ids.map((id) => id.toString())).size === ids.length,
    {
      message: "Company access IDs must not contain duplicate values.",
    },
  );

/**
 * Shared company route params.
 */
const companyParamsSchema = z.object({
  companyId: objectIdSchema,
});

/**
 * Shared company and team route params.
 */
const teamParamsSchema = z.object({
  companyId: objectIdSchema,
  teamId: objectIdSchema,
});

/**
 * Create team.
 *
 * POST /companies/:companyId/teams
 */
export const createTeamSchema = z.object({
  params: companyParamsSchema,

  body: z
    .object({
      departmentId: objectIdSchema,

      name: teamNameSchema,

      code: teamCodeSchema,

      description: teamDescriptionSchema.optional().default(""),

      teamLeadIds: uniqueCompanyAccessIdsSchema.optional().default([]),

      status: teamStatusSchema.optional().default("ACTIVE"),
    })
    .strict(),
});

/**
 * List teams.
 *
 * GET /companies/:companyId/teams
 */
export const listTeamsSchema = z.object({
  params: companyParamsSchema,

  query: z
    .object({
      page: z.coerce
        .number({
          invalid_type_error: "Page must be a valid number.",
        })
        .int("Page must be an integer.")
        .min(1, "Page must be at least 1.")
        .optional()
        .default(1),

      limit: z.coerce
        .number({
          invalid_type_error: "Limit must be a valid number.",
        })
        .int("Limit must be an integer.")
        .min(1, "Limit must be at least 1.")
        .max(100, "Limit cannot exceed 100 records.")
        .optional()
        .default(10),

      search: z
        .string({
          invalid_type_error: "Search must be a string.",
        })
        .trim()
        .max(100, "Search cannot exceed 100 characters.")
        .optional(),

      departmentId: optionalObjectIdSchema,

      status: teamStatusSchema.optional(),

      teamLeadId: optionalObjectIdSchema,

      sortBy: z
        .enum(["name", "code", "status", "createdAt", "updatedAt"])
        .optional()
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    })
    .strict(),
});

/**
 * Get one team.
 *
 * GET /companies/:companyId/teams/:teamId
 */
export const getTeamByIdSchema = z.object({
  params: teamParamsSchema,
});

/**
 * Update team.
 *
 * PATCH /companies/:companyId/teams/:teamId
 */
export const updateTeamSchema = z.object({
  params: teamParamsSchema,

  body: z
    .object({
      departmentId: objectIdSchema.optional(),

      name: teamNameSchema.optional(),

      code: teamCodeSchema.optional(),

      description: teamDescriptionSchema.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one team field must be provided for update.",
    }),
});

/**
 * Update team status.
 *
 * PATCH /companies/:companyId/teams/:teamId/status
 */
export const updateTeamStatusSchema = z.object({
  params: teamParamsSchema,

  body: z
    .object({
      status: teamStatusSchema,
    })
    .strict(),
});

/**
 * Assign or replace team leads.
 *
 * PATCH /companies/:companyId/teams/:teamId/leads
 *
 * Sending an empty array removes all team leads.
 */
export const assignTeamLeadsSchema = z.object({
  params: teamParamsSchema,

  body: z
    .object({
      teamLeadIds: uniqueCompanyAccessIdsSchema,
    })
    .strict(),
});

/**
 * Assign members to a team.
 *
 * PATCH /companies/:companyId/teams/:teamId/members
 *
 * CompanyAccess records will be updated with:
 * - departmentId from the Team document
 * - teamId from the route
 */
export const assignTeamMembersSchema = z.object({
  params: teamParamsSchema,

  body: z
    .object({
      memberIds: uniqueCompanyAccessIdsSchema.min(
        1,
        "At least one team member must be provided.",
      ),
    })
    .strict(),
});

/**
 * Remove members from a team.
 *
 * PATCH /companies/:companyId/teams/:teamId/members/remove
 *
 * Their teamId will be set to null.
 * Their departmentId can remain unchanged.
 */
export const removeTeamMembersSchema = z.object({
  params: teamParamsSchema,

  body: z
    .object({
      memberIds: uniqueCompanyAccessIdsSchema.min(
        1,
        "At least one team member must be provided.",
      ),
    })
    .strict(),
});

/**
 * Soft delete team.
 *
 * DELETE /companies/:companyId/teams/:teamId
 */
export const deleteTeamSchema = z.object({
  params: teamParamsSchema,
});
