import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid company ID.");

const optionalText = (maxLength) =>
  z.string().trim().max(maxLength).optional().or(z.literal(""));

const optionalMobileSchema = z
  .string()
  .trim()
  .max(20, "Mobile number cannot exceed 20 characters.")
  .optional()
  .or(z.literal(""));

const dateSchema = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), "Invalid date.");

export const createCompanyAdministratorSchema = z.object({
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

      mobile: optionalMobileSchema,

      password: z
        .string()
        .min(8, "Password must contain at least 8 characters.")
        .max(128, "Password cannot exceed 128 characters."),

      gender: z
        .enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"])
        .default("PREFER_NOT_TO_SAY"),

      dateOfBirth: dateSchema.optional().nullable(),

      employeeCode: z
        .string()
        .trim()
        .min(1, "Employee code is required.")
        .max(50, "Employee code cannot exceed 50 characters."),

      designation: z
        .string()
        .trim()
        .min(2, "Designation must contain at least 2 characters.")
        .max(100, "Designation cannot exceed 100 characters.")
        .default("Company Administrator"),

      employmentType: z
        .enum([
          "FULL_TIME",
          "PART_TIME",
          "CONTRACT",
          "INTERN",
          "CONSULTANT",
          "FREELANCER",
        ])
        .default("FULL_TIME"),

      joiningDate: dateSchema.optional().nullable(),

      workLocationType: z
        .enum(["HEAD_OFFICE", "BRANCH", "REMOTE", "HYBRID", "CLIENT_LOCATION"])
        .default("HEAD_OFFICE"),

      workLocationName: optionalText(150),

      emailVerified: z.boolean().default(false),

      mobileVerified: z.boolean().default(false),

      notes: optionalText(1000),
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const companyAdministratorCompanyIdSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z.object({
    companyId: objectIdSchema,
  }),

  query: z.object({}).strict().optional(),
});
