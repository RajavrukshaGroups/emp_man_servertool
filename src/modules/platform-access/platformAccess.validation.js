import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const optionalText = (maxLength) =>
  z.string().trim().max(maxLength).optional().or(z.literal(""));

const platformAccessStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

export const createPlatformAdminSchema = z.object({
  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),

  body: z
    .object({
      firstName: z
        .string()
        .trim()
        .min(2, "First name must contain at least 2 characters.")
        .max(100, "First name cannot exceed 100 characters."),

      middleName: optionalText(100),

      lastName: z
        .string()
        .trim()
        .min(1, "Last name is required.")
        .max(100, "Last name cannot exceed 100 characters."),

      displayName: optionalText(200),

      email: z
        .string()
        .trim()
        .email("Invalid email address.")
        .max(150, "Email cannot exceed 150 characters."),

      mobile: z
        .string()
        .trim()
        .max(20, "Mobile number cannot exceed 20 characters.")
        .optional()
        .or(z.literal("")),

      password: z
        .string()
        .min(8, "Password must contain at least 8 characters.")
        .max(128, "Password cannot exceed 128 characters."),

      roleId: objectIdSchema,

      status: platformAccessStatusSchema.default("ACTIVE"),

      emailVerified: z.boolean().default(false),

      mobileVerified: z.boolean().default(false),
    })
    .strict(),
});

export const listPlatformAdminsSchema = z.object({
  params: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),

  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),

      limit: z.coerce.number().int().min(1).max(100).default(10),

      search: z.string().trim().max(100).optional(),

      status: platformAccessStatusSchema.optional(),

      sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),
});

export const platformAdminIdSchema = z.object({
  params: z
    .object({
      platformAccessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),
});

export const updatePlatformAdminSchema = z.object({
  params: z
    .object({
      platformAccessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z
    .object({
      firstName: z.string().trim().min(2).max(100).optional(),

      middleName: optionalText(100),

      lastName: z.string().trim().min(1).max(100).optional(),

      displayName: optionalText(200),

      email: z.string().trim().email().max(150).optional(),

      mobile: z.string().trim().max(20).optional().or(z.literal("")),

      roleId: objectIdSchema.optional(),

      emailVerified: z.boolean().optional(),

      mobileVerified: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one platform administrator field must be provided.",
    }),
});

export const updatePlatformAdminStatusSchema = z.object({
  params: z
    .object({
      platformAccessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z
    .object({
      status: platformAccessStatusSchema,
    })
    .strict(),
});

export const resetPlatformAdminPasswordSchema = z.object({
  params: z
    .object({
      platformAccessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z
    .object({
      password: z
        .string()
        .min(8, "Password must contain at least 8 characters.")
        .max(128, "Password cannot exceed 128 characters."),

      confirmPassword: z.string().min(1, "Confirm password is required."),
    })
    .strict()
    .superRefine((data, context) => {
      if (data.password !== data.confirmPassword) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: "Password and confirmation password do not match.",
        });
      }
    }),
});

/**
 * GET /platform/roles
 */
export const listPlatformRolesSchema = z.object({
  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),
});
