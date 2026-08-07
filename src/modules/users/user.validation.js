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

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must contain at least 2 characters.")
  .max(50, "Name cannot exceed 50 characters.")
  .regex(
    /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/,
    "Name may contain only letters, spaces, apostrophes and hyphens.",
  );

const emailSchema = z
  .string()
  .trim()
  .email("Please provide a valid email address.")
  .max(150, "Email cannot exceed 150 characters.")
  .transform((value) => value.toLowerCase());

const mobileSchema = z
  .string()
  .trim()
  .min(7, "Mobile number must contain at least 7 digits.")
  .max(20, "Mobile number cannot exceed 20 characters.")
  .regex(/^\+?[0-9\s()-]+$/, "Please provide a valid mobile number.");

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters.")
  .max(128, "Password cannot exceed 128 characters.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character.",
  );

export const createUserSchema = z.object({
  body: z
    .object({
      firstName: nameSchema,

      middleName: nameSchema.optional().or(z.literal("")),

      lastName: z
        .string()
        .trim()
        .min(1, "Last name is required.")
        .max(50, "Last name cannot exceed 50 characters."),

      displayName: optionalText(120),

      email: emailSchema,

      mobile: mobileSchema.optional().nullable(),

      password: passwordSchema,

      forEmployeeOnboarding: z.boolean().optional().default(false),
      profilePhoto: z
        .string()
        .trim()
        .url("Profile photo must be a valid URL.")
        .optional()
        .or(z.literal("")),

      gender: z
        .enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"])
        .default("PREFER_NOT_TO_SAY"),

      dateOfBirth: z.coerce
        .date()
        .max(new Date(), "Date of birth cannot be in the future.")
        .optional()
        .nullable(),

      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),

      emailVerified: z.boolean().default(false),

      mobileVerified: z.boolean().default(false),
    })
    .strict(),

  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});

export const updateUserSchema = z.object({
  body: z
    .object({
      firstName: nameSchema.optional(),

      middleName: nameSchema.optional().or(z.literal("")),

      lastName: z.string().trim().min(1).max(50).optional(),

      displayName: optionalText(120),

      email: emailSchema.optional(),

      mobile: mobileSchema.optional().nullable(),

      profilePhoto: z
        .string()
        .trim()
        .url("Profile photo must be a valid URL.")
        .optional()
        .or(z.literal("")),

      gender: z
        .enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"])
        .optional(),

      dateOfBirth: z.coerce
        .date()
        .max(new Date(), "Date of birth cannot be in the future.")
        .optional()
        .nullable(),

      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),

      emailVerified: z.boolean().optional(),

      mobileVerified: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field is required for update.",
    }),

  params: z
    .object({
      userId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const userIdParamSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      userId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const updateUserStatusSchema = z.object({
  body: z
    .object({
      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]),
    })
    .strict(),

  params: z
    .object({
      userId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const changePasswordSchema = z
  .object({
    body: z
      .object({
        currentPassword: z.string().min(1, "Current password is required."),

        newPassword: passwordSchema,

        confirmPassword: z
          .string()
          .min(1, "Password confirmation is required."),
      })
      .strict(),

    params: z
      .object({
        userId: objectIdSchema,
      })
      .strict(),

    query: z.object({}).strict().optional(),
  })
  .superRefine((data, context) => {
    if (data.body.newPassword !== data.body.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "confirmPassword"],
        message: "New password and confirmation do not match.",
      });
    }

    if (data.body.currentPassword === data.body.newPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "newPassword"],
        message: "New password must be different from current password.",
      });
    }
  });

export const resetPasswordSchema = z
  .object({
    body: z
      .object({
        newPassword: passwordSchema,

        confirmPassword: z
          .string()
          .min(1, "Password confirmation is required."),
      })
      .strict(),

    params: z
      .object({
        userId: objectIdSchema,
      })
      .strict(),

    query: z.object({}).strict().optional(),
  })
  .superRefine((data, context) => {
    if (data.body.newPassword !== data.body.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "confirmPassword"],
        message: "New password and confirmation do not match.",
      });
    }
  });

export const listUsersSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z.object({}).strict().optional(),

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

      status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),

      gender: z
        .enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"])
        .optional(),

      emailVerified: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

      mobileVerified: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

      sortBy: z
        .enum([
          "firstName",
          "lastName",
          "displayName",
          "email",
          "status",
          "createdAt",
          "updatedAt",
          "lastLoginAt",
        ])
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),
});
