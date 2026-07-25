import { z } from "zod";

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const optionalString = (maxLength) =>
  z.string().trim().max(maxLength).optional();

const positiveIntegerQuerySchema = z
  .string()
  .regex(/^\d+$/, "Must be a positive integer.")
  .transform(Number)
  .refine((value) => value >= 1, "Must be at least 1.");

const addressSchema = z
  .object({
    addressLine1: optionalString(200),
    addressLine2: optionalString(200),
    city: optionalString(100),
    district: optionalString(100),
    state: optionalString(100),
    country: optionalString(100),
    postalCode: optionalString(20),
  })
  .strict();

const emergencyContactSchema = z
  .object({
    name: z.string().trim().min(1).max(150),

    relationship: z.string().trim().min(1).max(100),

    mobile: z.string().trim().min(5).max(20),

    alternateMobile: optionalString(20),
  })
  .strict();

const documentSchema = z
  .object({
    documentType: z.string().trim().min(1).max(100),

    documentName: optionalString(200),

    documentNumber: optionalString(150),

    fileUrl: optionalString(1000),

    expiryDate: z.coerce.date().nullable().optional(),
  })
  .strict();

const personalDetailsSchema = z
  .object({
    dateOfBirth: z.coerce.date().nullable().optional(),

    gender: z
      .enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"])
      .nullable()
      .optional(),

    maritalStatus: z
      .enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "SEPARATED", "OTHER"])
      .nullable()
      .optional(),

    bloodGroup: z
      .enum([
        "A_POSITIVE",
        "A_NEGATIVE",
        "B_POSITIVE",
        "B_NEGATIVE",
        "AB_POSITIVE",
        "AB_NEGATIVE",
        "O_POSITIVE",
        "O_NEGATIVE",
        "UNKNOWN",
      ])
      .nullable()
      .optional(),

    nationality: optionalString(100),
  })
  .strict();

const contactDetailsSchema = z
  .object({
    personalEmail: z.string().email().optional(),

    alternateMobile: optionalString(20),

    currentAddress: addressSchema.optional(),

    permanentAddress: addressSchema.optional(),

    isPermanentAddressSame: z.boolean().optional(),
  })
  .strict();

const bankDetailsSchema = z
  .object({
    accountHolderName: optionalString(200),

    bankName: optionalString(200),

    accountNumber: optionalString(50),

    ifscCode: optionalString(20),

    branchName: optionalString(200),

    accountType: z
      .enum(["SAVINGS", "CURRENT", "SALARY", "OTHER"])
      .nullable()
      .optional(),
  })
  .strict();

const statutoryDetailsSchema = z
  .object({
    panNumber: optionalString(20),

    aadhaarNumber: optionalString(20),

    uanNumber: optionalString(30),

    esiNumber: optionalString(30),

    pfNumber: optionalString(50),

    taxRegime: z.enum(["OLD", "NEW"]).nullable().optional(),
  })
  .strict();

const employeeBodySchema = {
  personalDetails: personalDetailsSchema.optional(),

  contactDetails: contactDetailsSchema.optional(),

  emergencyContacts: z.array(emergencyContactSchema).optional(),

  bankDetails: bankDetailsSchema.optional(),

  statutoryDetails: statutoryDetailsSchema.optional(),

  documents: z.array(documentSchema).optional(),
};

export const createEmployeeSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      companyAccessId: objectIdSchema,

      ...employeeBodySchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const listEmployeesSchema = z.object({
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

      search: z.string().trim().max(100).optional(),

      status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),

      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      roleId: objectIdSchema.optional(),

      employmentType: z.string().trim().max(100).optional(),

      sortBy: z.enum(["createdAt", "updatedAt", "status"]).default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict(),

  body: z.object({}).strict().optional(),
});

export const getEmployeeByIdSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,

      employeeId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),
});

export const updateEmployeeSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,

      employeeId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      ...employeeBodySchema,
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one employee field must be provided for update.",
    }),

  query: z.object({}).strict().optional(),
});

export const updateEmployeeStatusSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,

      employeeId: objectIdSchema,
    })
    .strict(),

  body: z
    .object({
      status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const deleteEmployeeSchema = z.object({
  params: z
    .object({
      companyId: objectIdSchema,

      employeeId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),

  body: z.object({}).strict().optional(),
});
