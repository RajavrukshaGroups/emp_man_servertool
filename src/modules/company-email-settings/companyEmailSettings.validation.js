import { z } from "zod";

const companyIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid company ID.");

const paramsSchema = z
  .object({
    companyId: companyIdSchema,
  })
  .strict();

export const getCompanyEmailSettingsSchema = z.object({
  params: paramsSchema,
  body: z.object({}).strict().optional(),
  query: z.object({}).strict().optional(),
});

export const updateCompanyEmailSettingsSchema = z.object({
  params: paramsSchema,

  body: z
    .object({
      provider: z.enum(["GOOGLE_WORKSPACE", "MICROSOFT_365"]),

      smtpUser: z
        .string()
        .trim()
        .email("Enter a valid SMTP username.")
        .max(254),

      smtpPassword: z.string().min(1, "SMTP credential is required.").max(1024),

      fromEmail: z
        .string()
        .trim()
        .email("Enter a valid sender email address.")
        .max(254),

      fromName: z.string().trim().min(2, "Sender name is required.").max(150),
    })
    .strict()
    .refine(
      (body) => body.smtpUser.toLowerCase() === body.fromEmail.toLowerCase(),
      {
        message: "SMTP username and sender email must match.",
        path: ["fromEmail"],
      },
    ),

  query: z.object({}).strict().optional(),
});

export const verifyCompanyEmailSettingsSchema = getCompanyEmailSettingsSchema;

export const updateCompanyEmailStatusSchema = z.object({
  params: paramsSchema,

  body: z
    .object({
      isEnabled: z.boolean(),
    })
    .strict(),

  query: z.object({}).strict().optional(),
});
