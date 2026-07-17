import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters.")
  .max(128, "Password cannot exceed 128 characters.");

const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, "Email or mobile number is required.")
  .max(150, "Login identifier cannot exceed 150 characters.");

export const loginSchema = z.object({
  body: z
    .object({
      identifier: loginIdentifierSchema,

      password: z
        .string()
        .min(1, "Password is required.")
        .max(128, "Password cannot exceed 128 characters."),

      companyId: objectIdSchema.optional(),

      rememberMe: z.boolean().default(false),
    })
    .strict(),

  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});

export const selectCompanySchema = z.object({
  body: z
    .object({
      companyAccessId: objectIdSchema,
    })
    .strict(),

  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});

export const refreshTokenSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});

export const logoutSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z
        .string()
        .min(1, "Current password is required.")
        .max(128, "Current password cannot exceed 128 characters."),

      newPassword: passwordSchema,

      confirmPassword: z
        .string()
        .min(1, "Password confirmation is required.")
        .max(128, "Password confirmation cannot exceed 128 characters."),
    })
    .strict()
    .superRefine((body, context) => {
      if (body.newPassword !== body.confirmPassword) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: "New password and confirmation password do not match.",
        });
      }

      if (body.currentPassword === body.newPassword) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["newPassword"],
          message: "New password must be different from the current password.",
        });
      }
    }),

  params: z.object({}).strict().optional(),

  query: z.object({}).strict().optional(),
});
