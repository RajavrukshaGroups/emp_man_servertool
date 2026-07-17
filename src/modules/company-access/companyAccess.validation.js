import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const employmentTypes = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "CONSULTANT",
  "FREELANCER",
];

const companyAccessStatuses = [
  "ONBOARDING",
  "ACTIVE",
  "INACTIVE",
  "RESIGNED",
  "TERMINATED",
];

const workLocationTypes = [
  "HEAD_OFFICE",
  "BRANCH",
  "REMOTE",
  "HYBRID",
  "CLIENT_LOCATION",
];

const optionalText = (maximumLength, fieldName = "Text") =>
  z
    .string()
    .trim()
    .max(
      maximumLength,
      `${fieldName} cannot exceed ${maximumLength} characters.`,
    )
    .optional();

const nullableObjectIdSchema = objectIdSchema.nullable().optional();

const optionalDateSchema = z.coerce.date().optional().nullable();

/**
 * Common cross-field validation.
 */
const validateCompanyAccessDates = (body, context, options = {}) => {
  const { requireLastWorkingDateForFinalStatus = true } = options;

  if (
    body.joiningDate &&
    body.probationEndDate &&
    body.probationEndDate < body.joiningDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["probationEndDate"],
      message: "Probation end date cannot be earlier than joining date.",
    });
  }

  if (
    body.joiningDate &&
    body.lastWorkingDate &&
    body.lastWorkingDate < body.joiningDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastWorkingDate"],
      message: "Last working date cannot be earlier than joining date.",
    });
  }

  if (
    requireLastWorkingDateForFinalStatus &&
    ["RESIGNED", "TERMINATED"].includes(body.status) &&
    !body.lastWorkingDate
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastWorkingDate"],
      message:
        "Last working date is required for resigned or terminated access.",
    });
  }

  if (
    body.lastWorkingDate &&
    body.status &&
    !["RESIGNED", "TERMINATED"].includes(body.status)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lastWorkingDate"],
      message:
        "Last working date can only be set when status is RESIGNED or TERMINATED.",
    });
  }
};

const createCompanyAccessBodySchema = z
  .object({
    userId: objectIdSchema,

    roleId: objectIdSchema,

    employeeCode: z
      .string()
      .trim()
      .min(1, "Employee code cannot be empty when provided.")
      .max(50, "Employee code cannot exceed 50 characters.")
      .regex(
        /^[A-Za-z0-9_/-]+$/,
        "Employee code may contain letters, numbers, underscores, hyphens and slashes only.",
      )
      .transform((value) => value.toUpperCase())
      .optional()
      .nullable(),

    designation: optionalText(100, "Designation").default(""),

    employmentType: z.enum(employmentTypes).default("FULL_TIME"),

    departmentId: nullableObjectIdSchema,

    teamId: nullableObjectIdSchema,

    reportingManagerId: nullableObjectIdSchema,

    joiningDate: optionalDateSchema,

    probationEndDate: optionalDateSchema,

    lastWorkingDate: optionalDateSchema,

    workLocationType: z.enum(workLocationTypes).default("HEAD_OFFICE"),

    workLocationName: optionalText(150, "Work location name").default(""),

    isPrimaryCompany: z.boolean().default(false),

    status: z.enum(companyAccessStatuses).default("ONBOARDING"),

    notes: optionalText(1000, "Notes").default(""),
  })
  .strict()
  .superRefine((body, context) => {
    validateCompanyAccessDates(body, context);
  });

export const createCompanyAccessSchema = z.object({
  body: createCompanyAccessBodySchema,

  params: z
    .object({
      companyId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

const updateCompanyAccessBodySchema = z
  .object({
    roleId: objectIdSchema.optional(),

    employeeCode: z
      .string()
      .trim()
      .min(1, "Employee code cannot be empty when provided.")
      .max(50, "Employee code cannot exceed 50 characters.")
      .regex(
        /^[A-Za-z0-9_/-]+$/,
        "Employee code may contain letters, numbers, underscores, hyphens and slashes only.",
      )
      .transform((value) => value.toUpperCase())
      .optional()
      .nullable(),

    designation: optionalText(100, "Designation"),

    employmentType: z.enum(employmentTypes).optional(),

    departmentId: nullableObjectIdSchema,

    teamId: nullableObjectIdSchema,

    reportingManagerId: nullableObjectIdSchema,

    joiningDate: optionalDateSchema,

    probationEndDate: optionalDateSchema,

    workLocationType: z.enum(workLocationTypes).optional(),

    workLocationName: optionalText(150, "Work location name"),

    isPrimaryCompany: z.boolean().optional(),

    notes: optionalText(1000, "Notes"),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required for update.",
  })
  .superRefine((body, context) => {
    validateCompanyAccessDates(body, context, {
      requireLastWorkingDateForFinalStatus: false,
    });
  });

export const updateCompanyAccessSchema = z.object({
  body: updateCompanyAccessBodySchema,

  params: z
    .object({
      companyId: objectIdSchema,
      accessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const companyAccessIdParamSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      companyId: objectIdSchema,
      accessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const updateCompanyAccessStatusSchema = z
  .object({
    body: z
      .object({
        status: z.enum(companyAccessStatuses),

        lastWorkingDate: optionalDateSchema,

        reason: z
          .string()
          .trim()
          .max(500, "Reason cannot exceed 500 characters.")
          .optional(),
      })
      .strict(),

    params: z
      .object({
        companyId: objectIdSchema,
        accessId: objectIdSchema,
      })
      .strict(),

    query: z.object({}).strict().optional(),
  })
  .superRefine((data, context) => {
    const { status, lastWorkingDate } = data.body;

    if (["RESIGNED", "TERMINATED"].includes(status) && !lastWorkingDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "lastWorkingDate"],
        message:
          "Last working date is required when status is RESIGNED or TERMINATED.",
      });
    }

    if (!["RESIGNED", "TERMINATED"].includes(status) && lastWorkingDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "lastWorkingDate"],
        message:
          "Last working date can only be provided when status is RESIGNED or TERMINATED.",
      });
    }
  });

export const updateCompanyAccessRoleSchema = z.object({
  body: z
    .object({
      roleId: objectIdSchema,
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
      accessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const updateReportingManagerSchema = z.object({
  body: z
    .object({
      reportingManagerId: objectIdSchema.nullable(),
    })
    .strict(),

  params: z
    .object({
      companyId: objectIdSchema,
      accessId: objectIdSchema,
    })
    .strict(),

  query: z.object({}).strict().optional(),
});

export const listCompanyAccessSchema = z.object({
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
        .max(100, "Search cannot exceed 100 characters.")
        .optional(),

      roleId: objectIdSchema.optional(),

      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      reportingManagerId: objectIdSchema.optional(),

      employmentType: z.enum(employmentTypes).optional(),

      workLocationType: z.enum(workLocationTypes).optional(),

      status: z.enum(companyAccessStatuses).optional(),

      isPrimaryCompany: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),

      joiningDateFrom: z.coerce.date().optional(),

      joiningDateTo: z.coerce.date().optional(),

      sortBy: z
        .enum([
          "employeeCode",
          "designation",
          "employmentType",
          "joiningDate",
          "status",
          "createdAt",
          "updatedAt",
        ])
        .default("createdAt"),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict()
    .superRefine((query, context) => {
      if (
        query.joiningDateFrom &&
        query.joiningDateTo &&
        query.joiningDateFrom > query.joiningDateTo
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["joiningDateTo"],
          message:
            "Joining date to must be later than or equal to joining date from.",
        });
      }
    }),
});

export const getUserCompanyAccessSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      userId: objectIdSchema,
    })
    .strict(),

  query: z
    .object({
      status: z.enum(companyAccessStatuses).optional(),
    })
    .strict(),
});
