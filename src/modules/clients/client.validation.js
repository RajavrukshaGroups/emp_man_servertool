import { z } from "zod";

/**
 * ============================================================
 * COMMON SCHEMAS
 * ============================================================
 */

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const optionalText = (maximumLength, fieldName = "Text") =>
  z
    .string()
    .trim()
    .max(
      maximumLength,
      `${fieldName} cannot exceed ${maximumLength} characters.`,
    )
    .optional()
    .or(z.literal(""));

const clientTypeSchema = z.enum(["IN_HOUSE", "EXTERNAL"]);

const engagementTypeSchema = z.enum([
  "RETAINER",
  "PROJECT",
  "ONE_TIME",
  "ONGOING",
  "OTHER",
]);

const clientStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

/**
 * ============================================================
 * EMAIL
 * ============================================================
 */

const optionalEmailSchema = z
  .string()
  .trim()
  .max(254, "Email cannot exceed 254 characters.")
  .email("Please provide a valid email address.")
  .optional()
  .or(z.literal(""));

/**
 * ============================================================
 * WEBSITE
 * ============================================================
 */

const optionalWebsiteSchema = z
  .string()
  .trim()
  .max(500, "Website URL cannot exceed 500 characters.")
  .url("Please provide a valid website URL.")
  .optional()
  .or(z.literal(""));

/**
 * ============================================================
 * CLIENT CODE
 * ============================================================
 */

const clientCodeSchema = z
  .string()
  .trim()
  .min(2, "Client code must contain at least 2 characters.")
  .max(30, "Client code cannot exceed 30 characters.")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Client code may contain only letters, numbers, hyphens and underscores.",
  )
  .transform((value) => value.toUpperCase());

/**
 * ============================================================
 * ADDRESS
 * ============================================================
 */

const clientAddressSchema = z
  .object({
    addressLine1: optionalText(200, "Address line 1").default(""),

    addressLine2: optionalText(200, "Address line 2").default(""),

    city: optionalText(100, "City").default(""),

    district: optionalText(100, "District").default(""),

    state: optionalText(100, "State").default(""),

    country: optionalText(100, "Country").default("India"),

    postalCode: optionalText(20, "Postal code").default(""),
  })
  .strict();

/**
 * ============================================================
 * PARAMS
 * ============================================================
 */

const companyParamsSchema = z
  .object({
    companyId: objectIdSchema,
  })
  .strict();

const clientParamsSchema = z
  .object({
    companyId: objectIdSchema,

    clientId: objectIdSchema,
  })
  .strict();

/**
 * ============================================================
 * CREATE CLIENT
 *
 * POST /companies/:companyId/clients
 * ============================================================
 */

export const createClientSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Client name must contain at least 2 characters.")
        .max(150, "Client name cannot exceed 150 characters."),

      code: clientCodeSchema,

      clientType: clientTypeSchema.default("EXTERNAL"),

      engagementType: engagementTypeSchema.default("PROJECT"),

      contactPerson: optionalText(150, "Contact person").default(""),

      email: optionalEmailSchema.default(""),

      mobile: optionalText(30, "Mobile number").default(""),

      alternateMobile: optionalText(30, "Alternate mobile number").default(""),

      website: optionalWebsiteSchema.default(""),

      address: clientAddressSchema.optional().default({
        addressLine1: "",
        addressLine2: "",
        city: "",
        district: "",
        state: "",
        country: "India",
        postalCode: "",
      }),

      industry: optionalText(150, "Industry").default(""),

      notes: optionalText(3000, "Client notes").default(""),

      status: clientStatusSchema.default("ACTIVE"),
    })
    .strict(),

  params: companyParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * UPDATE CLIENT
 *
 * PATCH /companies/:companyId/clients/:clientId
 * ============================================================
 */

export const updateClientSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Client name must contain at least 2 characters.")
        .max(150, "Client name cannot exceed 150 characters.")
        .optional(),

      code: clientCodeSchema.optional(),

      clientType: clientTypeSchema.optional(),

      engagementType: engagementTypeSchema.optional(),

      contactPerson: optionalText(150, "Contact person"),

      email: optionalEmailSchema,

      mobile: optionalText(30, "Mobile number"),

      alternateMobile: optionalText(30, "Alternate mobile number"),

      website: optionalWebsiteSchema,

      address: z
        .object({
          addressLine1: optionalText(200, "Address line 1"),

          addressLine2: optionalText(200, "Address line 2"),

          city: optionalText(100, "City"),

          district: optionalText(100, "District"),

          state: optionalText(100, "State"),

          country: optionalText(100, "Country"),

          postalCode: optionalText(20, "Postal code"),
        })
        .strict()
        .optional(),

      industry: optionalText(150, "Industry"),

      notes: optionalText(3000, "Client notes"),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field is required for update.",
    }),

  params: clientParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * UPDATE STATUS
 *
 * PATCH /companies/:companyId/clients/:clientId/status
 * ============================================================
 */

export const updateClientStatusSchema = z.object({
  body: z
    .object({
      status: clientStatusSchema,
    })
    .strict(),

  params: clientParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * GET CLIENT BY ID
 *
 * GET /companies/:companyId/clients/:clientId
 * ============================================================
 */

export const getClientByIdSchema = z.object({
  body: z.object({}).strict().optional(),

  params: clientParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * LIST CLIENTS
 *
 * GET /companies/:companyId/clients
 * ============================================================
 */

export const listClientsSchema = z.object({
  body: z.object({}).strict().optional(),

  params: companyParamsSchema,

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
        .max(200, "Search text cannot exceed 200 characters.")
        .optional(),

      status: clientStatusSchema.optional(),

      clientType: clientTypeSchema.optional(),

      engagementType: engagementTypeSchema.optional(),

      industry: z
        .string()
        .trim()
        .max(150, "Industry filter cannot exceed 150 characters.")
        .optional(),

      sortBy: z
        .enum([
          "name",
          "code",
          "clientType",
          "engagementType",
          "industry",
          "status",
          "createdAt",
          "updatedAt",
        ])
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),
});

/**
 * ============================================================
 * DELETE CLIENT
 *
 * DELETE /companies/:companyId/clients/:clientId
 * ============================================================
 */

export const deleteClientSchema = z.object({
  body: z.object({}).strict().optional(),

  params: clientParamsSchema,

  query: z.object({}).strict().optional(),
});
