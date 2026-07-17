import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid company ID.");

const optionalText = (maximumLength) =>
  z.string().trim().max(maximumLength).optional().or(z.literal(""));

const addressSchema = z
  .object({
    addressLine1: optionalText(250),
    addressLine2: optionalText(250),
    city: optionalText(100),
    state: optionalText(100),
    country: optionalText(100),
    postalCode: optionalText(20),
  })
  .optional();

export const createCompanySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Company name must contain at least 2 characters.")
      .max(150, "Company name cannot exceed 150 characters."),

    legalName: optionalText(200),

    code: z
      .string()
      .trim()
      .min(2, "Company code must contain at least 2 characters.")
      .max(20, "Company code cannot exceed 20 characters.")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Company code may contain only letters, numbers, underscore and hyphen.",
      ),

    logo: optionalText(500),

    email: z
      .string()
      .trim()
      .email("Invalid company email.")
      .optional()
      .or(z.literal("")),

    phone: optionalText(20),

    website: z
      .string()
      .trim()
      .url("Invalid website URL.")
      .optional()
      .or(z.literal("")),

    address: addressSchema,

    timezone: z.string().trim().min(1).default("Asia/Kolkata"),

    currency: z
      .string()
      .trim()
      .length(3, "Currency must be a valid three-letter code.")
      .default("INR"),

    dateFormat: z
      .enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"])
      .default("DD/MM/YYYY"),

    timeFormat: z.enum(["12_HOUR", "24_HOUR"]).default("12_HOUR"),

    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  }),

  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateCompanySchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(150).optional(),

      legalName: optionalText(200),

      code: z
        .string()
        .trim()
        .min(2)
        .max(20)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),

      logo: optionalText(500),

      email: z
        .string()
        .trim()
        .email("Invalid company email.")
        .optional()
        .or(z.literal("")),

      phone: optionalText(20),

      website: z
        .string()
        .trim()
        .url("Invalid website URL.")
        .optional()
        .or(z.literal("")),

      address: addressSchema,

      timezone: z.string().trim().min(1).optional(),

      currency: z.string().trim().length(3).optional(),

      dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).optional(),

      timeFormat: z.enum(["12_HOUR", "24_HOUR"]).optional(),

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field is required for update.",
    }),

  params: z.object({
    companyId: objectIdSchema,
  }),

  query: z.object({}).optional(),
});

export const companyIdParamSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({
    companyId: objectIdSchema,
  }),

  query: z.object({}).optional(),
});

export const companyStatusSchema = z.object({
  body: z.object({
    status: z.enum(["ACTIVE", "INACTIVE"]),
  }),

  params: z.object({
    companyId: objectIdSchema,
  }),

  query: z.object({}).optional(),
});

export const listCompaniesSchema = z.object({
  body: z.object({}).optional(),

  params: z.object({}).optional(),

  query: z.object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(10),

    search: z.string().trim().optional(),

    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

    sortBy: z
      .enum(["name", "code", "createdAt", "updatedAt", "status"])
      .default("createdAt"),

    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),
});
