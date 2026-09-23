import { z } from "zod";

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

const optionalNullableDate = z.union([z.coerce.date(), z.null()]).optional();

const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);

const halfDayNumberSchema = z.coerce
  .number()
  .min(0, "Leave days cannot be negative.")
  .refine(
    (value) => Number.isInteger(value * 2),
    "Leave days must use whole-day or half-day increments.",
  );

const positiveHalfDayNumberSchema = z.coerce
  .number()
  .min(0.5, "Leave days must be at least 0.5.")
  .refine(
    (value) => Number.isInteger(value * 2),
    "Leave days must use whole-day or half-day increments.",
  );

const optionalPositiveHalfDayNumberSchema = z
  .union([positiveHalfDayNumberSchema, z.null()])
  .optional();

const allocationMethodSchema = z.enum([
  "ANNUAL_UPFRONT",
  "MONTHLY_ACCRUAL",
  "MANUAL",
  "NO_BALANCE",
]);

const paymentTypeSchema = z.enum(["PAID", "UNPAID"]);

const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const sortOrderSchema = z.enum(["asc", "desc"]).default("desc");

const companyParamsSchema = z
  .object({
    companyId: objectIdSchema,
  })
  .strict();

const leavePolicyParamsSchema = z
  .object({
    companyId: objectIdSchema,
    policyId: objectIdSchema,
  })
  .strict();

const leaveTypeParamsSchema = z
  .object({
    companyId: objectIdSchema,
    leaveTypeId: objectIdSchema,
  })
  .strict();

/**
 * ============================================================
 * LEAVE POLICY
 * ============================================================
 */

const leavePolicyFields = {
  name: z
    .string()
    .trim()
    .min(2, "Leave policy name must contain at least 2 characters.")
    .max(100, "Leave policy name cannot exceed 100 characters."),

  code: z
    .string()
    .trim()
    .min(2, "Leave policy code must contain at least 2 characters.")
    .max(30, "Leave policy code cannot exceed 30 characters.")
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      "Leave policy code may contain only letters, numbers and underscores.",
    )
    .transform((value) => value.toUpperCase()),

  description: optionalText(1000, "Leave policy description").default(""),

  leaveYearStartMonth: z.coerce
    .number()
    .int("Leave year start month must be a whole number.")
    .min(1, "Leave year start month must be between 1 and 12.")
    .max(12, "Leave year start month must be between 1 and 12.")
    .default(1),

  leaveYearStartDay: z.coerce
    .number()
    .int("Leave year start day must be a whole number.")
    .min(1, "Leave year start day must be between 1 and 28.")
    .max(28, "Leave year start day must be between 1 and 28.")
    .default(1),

  excludeWeeklyOffsFromLeaveDays: z.boolean().default(true),

  excludePublicHolidaysFromLeaveDays: z.boolean().default(true),

  sandwichRule: z
    .enum(["NONE", "COUNT_INTERVENING_NON_WORKING_DAYS"])
    .default("NONE"),

  approvalWorkflow: z
    .enum(["DIRECT_APPROVAL", "RECOMMEND_THEN_APPROVE"])
    .default("RECOMMEND_THEN_APPROVE"),

  allowApprovalWithoutRecommendation: z.boolean().default(true),

  preventOverlappingRequests: z.boolean().default(true),

  preventAttendanceConflict: z.boolean().default(true),

  maximumFutureApplicationDays: z
    .union([
      z.coerce
        .number()
        .int("Maximum future application days must be a whole number.")
        .min(0, "Maximum future application days cannot be negative.")
        .max(1095, "Maximum future application days cannot exceed 1095 days."),
      z.null(),
    ])
    .default(null),

  requireReason: z.boolean().default(true),

  autoCreateLeaveBalances: z.boolean().default(true),

  reserveBalanceOnSubmission: z.boolean().default(true),

  prorateEntitlementForNewJoiners: z.boolean().default(true),

  prorationRounding: z
    .enum(["DOWN_TO_HALF", "NEAREST_HALF", "UP_TO_HALF"])
    .default("NEAREST_HALF"),

  allowEmployeeCancelPending: z.boolean().default(true),

  allowEmployeeCancelRecommended: z.boolean().default(true),

  allowApprovedLeaveCancellation: z.boolean().default(false),

  approvedCancellationRequiresApproval: z.boolean().default(true),

  effectiveFrom: z.coerce.date(),

  effectiveTo: z.union([z.coerce.date(), z.null()]).default(null),

  isDefault: z.boolean().default(false),

  status: statusSchema.default("ACTIVE"),
};

export const initializeLeaveBalanceSchema = z.object({
  body: z
    .object({
      employeeId: objectIdSchema,
      leaveTypeId: objectIdSchema,
      leavePolicyId: objectIdSchema,

      leaveYearStart: z.coerce.date(),
      leaveYearEnd: z.coerce.date(),

      leaveYearLabel: z
        .string()
        .trim()
        .min(1, "Leave year label is required.")
        .max(20, "Leave year label cannot exceed 20 characters."),

      carriedForwardDays: halfDayNumberSchema.max(366).default(0),
    })
    .strict()
    .refine(
      (body) => body.leaveYearEnd.getTime() >= body.leaveYearStart.getTime(),
      {
        message: "Leave year end cannot be before leave year start.",
        path: ["leaveYearEnd"],
      },
    ),

  params: companyParamsSchema,

  query: z.object({}).strict().optional(),
});

export const createLeavePolicySchema = z.object({
  body: z
    .object(leavePolicyFields)
    .strict()
    .refine(
      (body) =>
        !body.effectiveTo ||
        body.effectiveTo.getTime() >= body.effectiveFrom.getTime(),
      {
        message: "Leave policy effectiveTo cannot be before effectiveFrom.",
        path: ["effectiveTo"],
      },
    ),

  params: companyParamsSchema,

  query: z.object({}).strict().optional(),
});

export const updateLeavePolicySchema = z.object({
  body: z
    .object({
      name: leavePolicyFields.name.optional(),
      code: leavePolicyFields.code.optional(),
      description: optionalText(1000, "Leave policy description"),

      leaveYearStartMonth: leavePolicyFields.leaveYearStartMonth.optional(),

      leaveYearStartDay: leavePolicyFields.leaveYearStartDay.optional(),

      excludeWeeklyOffsFromLeaveDays: z.boolean().optional(),
      excludePublicHolidaysFromLeaveDays: z.boolean().optional(),

      sandwichRule: leavePolicyFields.sandwichRule.optional(),

      approvalWorkflow: leavePolicyFields.approvalWorkflow.optional(),

      allowApprovalWithoutRecommendation: z.boolean().optional(),
      preventOverlappingRequests: z.boolean().optional(),
      preventAttendanceConflict: z.boolean().optional(),

      maximumFutureApplicationDays:
        leavePolicyFields.maximumFutureApplicationDays.optional(),

      requireReason: z.boolean().optional(),
      autoCreateLeaveBalances: z.boolean().optional(),
      reserveBalanceOnSubmission: z.boolean().optional(),
      prorateEntitlementForNewJoiners: z.boolean().optional(),

      prorationRounding: leavePolicyFields.prorationRounding.optional(),

      allowEmployeeCancelPending: z.boolean().optional(),
      allowEmployeeCancelRecommended: z.boolean().optional(),
      allowApprovedLeaveCancellation: z.boolean().optional(),
      approvedCancellationRequiresApproval: z.boolean().optional(),

      effectiveFrom: z.coerce.date().optional(),
      effectiveTo: optionalNullableDate,

      isDefault: z.boolean().optional(),
      status: statusSchema.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one leave policy field is required for update.",
    })
    .refine(
      (body) =>
        !body.effectiveFrom ||
        !body.effectiveTo ||
        body.effectiveTo.getTime() >= body.effectiveFrom.getTime(),
      {
        message: "Leave policy effectiveTo cannot be before effectiveFrom.",
        path: ["effectiveTo"],
      },
    ),

  params: leavePolicyParamsSchema,

  query: z.object({}).strict().optional(),
});

export const listLeavePoliciesSchema = z.object({
  body: z.object({}).strict().optional(),

  params: companyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      search: z.string().trim().max(100).optional(),
      status: statusSchema.optional(),
      isDefault: z.enum(["true", "false"]).optional(),
      effectiveOn: z.coerce.date().optional(),

      sortBy: z
        .enum(["name", "code", "effectiveFrom", "createdAt", "updatedAt"])
        .default("createdAt"),

      sortOrder: sortOrderSchema,
    })
    .strict(),
});

export const getLeavePolicySchema = z.object({
  body: z.object({}).strict().optional(),
  params: leavePolicyParamsSchema,
  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * LEAVE TYPE
 * ============================================================
 */

const leaveTypeFields = {
  name: z
    .string()
    .trim()
    .min(2, "Leave type name must contain at least 2 characters.")
    .max(100, "Leave type name cannot exceed 100 characters."),

  code: z
    .string()
    .trim()
    .min(2, "Leave type code must contain at least 2 characters.")
    .max(30, "Leave type code cannot exceed 30 characters.")
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      "Leave type code may contain only letters, numbers and underscores.",
    )
    .transform((value) => value.toUpperCase()),

  description: optionalText(1000, "Leave type description").default(""),

  paymentType: paymentTypeSchema.default("PAID"),

  requiresBalance: z.boolean().default(true),

  annualEntitlementDays: halfDayNumberSchema.max(366).default(0),

  allocationMethod: allocationMethodSchema.default("ANNUAL_UPFRONT"),

  monthlyEntitlementDays: halfDayNumberSchema.max(31).default(0),

  maximumMonthlyUsageDays: optionalPositiveHalfDayNumberSchema,

  allowMonthlyAccumulation: z.boolean().default(true),

  allowHalfDay: z.boolean().default(true),

  minimumServiceDays: z.coerce
    .number()
    .int("Minimum service days must be a whole number.")
    .min(0)
    .max(3650)
    .default(0),

  minimumNoticeDays: z.coerce
    .number()
    .int("Minimum notice days must be a whole number.")
    .min(0)
    .max(365)
    .default(0),

  maximumConsecutiveDays: optionalPositiveHalfDayNumberSchema,

  allowBackdatedApplication: z.boolean().default(false),

  maximumBackdatedDays: z.coerce
    .number()
    .int("Maximum backdated days must be a whole number.")
    .min(0)
    .max(365)
    .default(0),

  requireAttachment: z.boolean().default(false),

  attachmentRequiredFromDays: optionalPositiveHalfDayNumberSchema,

  allowNegativeBalance: z.boolean().default(false),

  carryForwardEnabled: z.boolean().default(false),

  maximumCarryForwardDays: halfDayNumberSchema.max(366).default(0),

  effectiveFrom: z.coerce.date(),

  effectiveTo: z.union([z.coerce.date(), z.null()]).default(null),

  status: statusSchema.default("ACTIVE"),
};

const validateLeaveTypeConfiguration = (body, context) => {
  if (
    body.allocationMethod === "ANNUAL_UPFRONT" &&
    body.annualEntitlementDays <= 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["annualEntitlementDays"],
      message:
        "Annual entitlement must be greater than 0 for annual-upfront leave.",
    });
  }

  if (
    body.allocationMethod === "MONTHLY_ACCRUAL" &&
    body.monthlyEntitlementDays <= 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["monthlyEntitlementDays"],
      message:
        "Monthly entitlement must be greater than 0 for monthly-accrual leave.",
    });
  }

  if (
    body.allowBackdatedApplication === false &&
    body.maximumBackdatedDays > 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maximumBackdatedDays"],
      message:
        "Maximum backdated days must be 0 when backdated applications are disabled.",
    });
  }

  if (body.carryForwardEnabled === false && body.maximumCarryForwardDays > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maximumCarryForwardDays"],
      message:
        "Maximum carry-forward days must be 0 when carry forward is disabled.",
    });
  }

  if (
    body.effectiveTo &&
    body.effectiveTo.getTime() < body.effectiveFrom.getTime()
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Leave type effectiveTo cannot be before effectiveFrom.",
    });
  }
};

export const createLeaveTypeSchema = z.object({
  body: z
    .object(leaveTypeFields)
    .strict()
    .superRefine(validateLeaveTypeConfiguration),

  params: companyParamsSchema,

  query: z.object({}).strict().optional(),
});

export const updateLeaveTypeSchema = z.object({
  body: z
    .object({
      name: leaveTypeFields.name.optional(),
      code: leaveTypeFields.code.optional(),
      description: optionalText(1000, "Leave type description"),

      paymentType: paymentTypeSchema.optional(),
      requiresBalance: z.boolean().optional(),

      annualEntitlementDays: halfDayNumberSchema.max(366).optional(),

      allocationMethod: allocationMethodSchema.optional(),

      monthlyEntitlementDays: halfDayNumberSchema.max(31).optional(),

      maximumMonthlyUsageDays: optionalPositiveHalfDayNumberSchema,

      allowMonthlyAccumulation: z.boolean().optional(),
      allowHalfDay: z.boolean().optional(),

      minimumServiceDays: leaveTypeFields.minimumServiceDays.optional(),
      minimumNoticeDays: leaveTypeFields.minimumNoticeDays.optional(),

      maximumConsecutiveDays: optionalPositiveHalfDayNumberSchema,

      allowBackdatedApplication: z.boolean().optional(),

      maximumBackdatedDays: leaveTypeFields.maximumBackdatedDays.optional(),

      requireAttachment: z.boolean().optional(),

      attachmentRequiredFromDays: optionalPositiveHalfDayNumberSchema,

      allowNegativeBalance: z.boolean().optional(),
      carryForwardEnabled: z.boolean().optional(),

      maximumCarryForwardDays: halfDayNumberSchema.max(366).optional(),

      effectiveFrom: z.coerce.date().optional(),
      effectiveTo: optionalNullableDate,

      status: statusSchema.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one leave type field is required for update.",
    }),

  params: leaveTypeParamsSchema,

  query: z.object({}).strict().optional(),
});

export const listLeaveTypesSchema = z.object({
  body: z.object({}).strict().optional(),

  params: companyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      search: z.string().trim().max(100).optional(),
      status: statusSchema.optional(),
      paymentType: paymentTypeSchema.optional(),
      allocationMethod: allocationMethodSchema.optional(),
      effectiveOn: z.coerce.date().optional(),

      sortBy: z
        .enum(["name", "code", "effectiveFrom", "createdAt", "updatedAt"])
        .default("createdAt"),

      sortOrder: sortOrderSchema,
    })
    .strict(),
});

export const getLeaveTypeSchema = z.object({
  body: z.object({}).strict().optional(),
  params: leaveTypeParamsSchema,
  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * LEAVE BALANCE
 * ============================================================
 */

const leaveBalanceParamsSchema = z
  .object({
    companyId: objectIdSchema,
    balanceId: objectIdSchema,
  })
  .strict();

const leaveBalanceStatusSchema = z.enum(["ACTIVE", "CLOSED"]);

/**
 * List leave balances.
 *
 * Scope enforcement does NOT belong in validation.
 *
 * Service/controller will later enforce:
 * COMPANY  -> entire company
 * TEAM     -> managed teams + self
 * EMPLOYEE -> self only
 */
export const listLeaveBalancesSchema = z.object({
  body: z.object({}).strict().optional(),

  params: companyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      employeeId: objectIdSchema.optional(),
      companyAccessId: objectIdSchema.optional(),
      leaveTypeId: objectIdSchema.optional(),
      leavePolicyId: objectIdSchema.optional(),

      allocationMethod: allocationMethodSchema.optional(),

      status: leaveBalanceStatusSchema.optional(),

      leaveYearStart: z.coerce.date().optional(),
      leaveYearEnd: z.coerce.date().optional(),

      search: z.string().trim().max(100).optional(),

      sortBy: z
        .enum([
          "leaveYearStart",
          "leaveYearEnd",
          "allocatedDays",
          "accruedDays",
          "pendingDays",
          "usedDays",
          "createdAt",
          "updatedAt",
        ])
        .default("leaveYearStart"),

      sortOrder: sortOrderSchema,
    })
    .strict()
    .refine(
      (query) =>
        !query.leaveYearStart ||
        !query.leaveYearEnd ||
        query.leaveYearEnd.getTime() >= query.leaveYearStart.getTime(),
      {
        message: "Leave year end cannot be before leave year start.",
        path: ["leaveYearEnd"],
      },
    ),
});

/**
 * Get one leave balance.
 */
export const getLeaveBalanceSchema = z.object({
  body: z.object({}).strict().optional(),

  params: leaveBalanceParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Get leave balances belonging to a specific employee.
 *
 * Authorization/scope will still be enforced by the service.
 */
export const getEmployeeLeaveBalancesSchema = z.object({
  body: z.object({}).strict().optional(),

  params: z
    .object({
      companyId: objectIdSchema,
      employeeId: objectIdSchema,
    })
    .strict(),

  query: z
    .object({
      leaveTypeId: objectIdSchema.optional(),

      status: leaveBalanceStatusSchema.optional(),

      leaveYearStart: z.coerce.date().optional(),
      leaveYearEnd: z.coerce.date().optional(),

      sortBy: z
        .enum(["leaveYearStart", "leaveYearEnd", "createdAt", "updatedAt"])
        .default("leaveYearStart"),

      sortOrder: sortOrderSchema,
    })
    .strict()
    .refine(
      (query) =>
        !query.leaveYearStart ||
        !query.leaveYearEnd ||
        query.leaveYearEnd.getTime() >= query.leaveYearStart.getTime(),
      {
        message: "Leave year end cannot be before leave year start.",
        path: ["leaveYearEnd"],
      },
    ),
});

/**
 * Administrative balance adjustment.
 *
 * Examples:
 * +1   -> manually credit one day
 * -0.5 -> deduct half a day
 *
 * We deliberately do NOT allow direct editing of allocatedDays,
 * accruedDays, pendingDays, usedDays, carriedForwardDays or
 * lapsedDays through this endpoint.
 */
export const adjustLeaveBalanceSchema = z.object({
  body: z
    .object({
      adjustmentDays: z.coerce
        .number()
        .refine((value) => value !== 0, "Leave adjustment cannot be zero.")
        .refine(
          (value) => Number.isInteger(value * 2),
          "Leave adjustment must use whole-day or half-day increments.",
        ),

      periodKey: z
        .string()
        .trim()
        .regex(
          /^\d{4}-(0[1-9]|1[0-2])$/,
          "Adjustment period must use YYYY-MM format.",
        )
        .optional(),

      reason: z
        .string()
        .trim()
        .min(3, "Adjustment reason must contain at least 3 characters.")
        .max(1000, "Adjustment reason cannot exceed 1000 characters."),
    })
    .strict(),

  params: leaveBalanceParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Accrue monthly leave entitlement.
 *
 * periodDate determines which YYYY-MM monthly bucket
 * should receive the configured monthly entitlement.
 */
/**
 * Accrue monthly leave entitlement.
 *
 * periodDate determines which YYYY-MM monthly bucket
 * receives the configured monthly entitlement.
 */
export const accrueMonthlyLeaveBalanceSchema = z.object({
  body: z
    .object({
      periodDate: z.coerce.date(),
    })
    .strict(),

  params: leaveBalanceParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Close a leave balance.
 *
 * Usually performed during leave-year closing/rollover.
 * closedAt will be controlled by backend business logic.
 */
export const closeLeaveBalanceSchema = z.object({
  body: z
    .object({
      reason: z
        .string()
        .trim()
        .min(3, "Closing reason must contain at least 3 characters.")
        .max(1000, "Closing reason cannot exceed 1000 characters.")
        .optional(),
    })
    .strict(),

  params: leaveBalanceParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * ============================================================
 * LEAVE REQUEST
 * ============================================================
 */

const leaveRequestParamsSchema = z
  .object({
    companyId: objectIdSchema,
    leaveRequestId: objectIdSchema,
  })
  .strict();

const leaveRequestStatusSchema = z.enum([
  "PENDING",
  "RECOMMENDED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

const leaveCancellationStatusSchema = z.enum([
  "NOT_REQUESTED",
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

const leaveDayPortionSchema = z.enum(["FULL_DAY", "FIRST_HALF", "SECOND_HALF"]);

const workflowNoteSchema = z
  .string()
  .trim()
  .max(2000, "Workflow note cannot exceed 2000 characters.")
  .optional()
  .or(z.literal(""));

const requiredWorkflowReasonSchema = z
  .string()
  .trim()
  .min(3, "Reason must contain at least 3 characters.")
  .max(2000, "Reason cannot exceed 2000 characters.");

/**
 * Employee submits a leave request.
 *
 * employeeId/companyAccessId are intentionally NOT accepted.
 * They will be resolved from the authenticated user.
 *
 * leavePolicyId, requestedDays, dateDetails, paymentType,
 * leaveBalanceId and organizational snapshots are also
 * server-controlled.
 */
export const createLeaveRequestSchema = z.object({
  body: z
    .object({
      leaveTypeId: objectIdSchema,

      fromDate: z.coerce.date(),

      toDate: z.coerce.date(),

      startDayPortion: leaveDayPortionSchema.default("FULL_DAY"),

      endDayPortion: leaveDayPortionSchema.default("FULL_DAY"),

      reason: z
        .string()
        .trim()
        .min(3, "Leave reason must contain at least 3 characters.")
        .max(3000, "Leave reason cannot exceed 3000 characters."),

      attachmentUrl: z
        .string()
        .trim()
        .max(2000, "Attachment URL cannot exceed 2000 characters.")
        .optional()
        .or(z.literal("")),
    })
    .strict()
    .superRefine((body, context) => {
      if (body.toDate.getTime() < body.fromDate.getTime()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "Leave end date cannot be before leave start date.",
        });

        return;
      }

      const fromDateKey = body.fromDate.toISOString().slice(0, 10);
      const toDateKey = body.toDate.toISOString().slice(0, 10);

      const isSingleDayRequest = fromDateKey === toDateKey;

      if (
        !isSingleDayRequest &&
        (body.startDayPortion !== "FULL_DAY" ||
          body.endDayPortion !== "FULL_DAY")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDayPortion"],
          message:
            "Half-day leave is currently supported only for single-day requests.",
        });
      }

      if (isSingleDayRequest && body.startDayPortion !== body.endDayPortion) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDayPortion"],
          message:
            "Start and end day portions must match for a single-day leave request.",
        });
      }
    }),

  params: companyParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * List leave requests.
 *
 * IMPORTANT:
 * Validation only validates filters.
 *
 * Actual visibility will later be enforced by service scope:
 *
 * COMPANY  -> entire company
 * TEAM     -> managed teams + self
 * EMPLOYEE -> self only
 */
export const listLeaveRequestsSchema = z.object({
  body: z.object({}).strict().optional(),

  params: companyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      employeeId: objectIdSchema.optional(),
      companyAccessId: objectIdSchema.optional(),
      departmentId: objectIdSchema.optional(),
      teamId: objectIdSchema.optional(),
      leaveTypeId: objectIdSchema.optional(),

      status: leaveRequestStatusSchema.optional(),

      cancellationStatus: leaveCancellationStatusSchema.optional(),

      paymentType: paymentTypeSchema.optional(),

      fromDate: z.coerce.date().optional(),
      toDate: z.coerce.date().optional(),

      search: z.string().trim().max(100).optional(),

      sortBy: z
        .enum([
          "fromDate",
          "toDate",
          "requestedDays",
          "status",
          "createdAt",
          "updatedAt",
        ])
        .default("createdAt"),

      sortOrder: sortOrderSchema,
    })
    .strict()
    .refine(
      (query) =>
        !query.fromDate ||
        !query.toDate ||
        query.toDate.getTime() >= query.fromDate.getTime(),
      {
        message: "Leave request toDate cannot be before fromDate.",
        path: ["toDate"],
      },
    ),
});

/**
 * Get one leave request.
 *
 * Service layer must still verify that the authenticated user
 * is allowed to see this request.
 */
export const getLeaveRequestSchema = z.object({
  body: z.object({}).strict().optional(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Recommend a pending leave request.
 *
 * Normally used by the Team Lead / reporting manager.
 */
export const recommendLeaveRequestSchema = z.object({
  body: z
    .object({
      note: workflowNoteSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Approve a pending/recommended leave request.
 *
 * Whether direct approval from PENDING is allowed will be
 * decided from the company's LeavePolicy.
 */
export const approveLeaveRequestSchema = z.object({
  body: z
    .object({
      note: workflowNoteSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Reject a pending/recommended leave request.
 */
export const rejectLeaveRequestSchema = z.object({
  body: z
    .object({
      reason: requiredWorkflowReasonSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Cancel a PENDING or RECOMMENDED request.
 *
 * Whether the employee is allowed to cancel these states will
 * later be determined from the company's LeavePolicy.
 */
export const cancelLeaveRequestSchema = z.object({
  body: z
    .object({
      reason: requiredWorkflowReasonSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Request cancellation of an already APPROVED leave.
 *
 * This does NOT immediately cancel the approved leave.
 * It starts the controlled approved-leave cancellation workflow.
 */
export const requestApprovedLeaveCancellationSchema = z.object({
  body: z
    .object({
      reason: requiredWorkflowReasonSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Approve an approved-leave cancellation request.
 *
 * Service layer will later:
 * - verify cancellationStatus === PENDING
 * - change leave status appropriately
 * - restore/release balance
 * - reverse attendance integration when applicable
 * - preserve audit/status history
 */
export const approveLeaveCancellationSchema = z.object({
  body: z
    .object({
      note: workflowNoteSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});

/**
 * Reject an approved-leave cancellation request.
 */
export const rejectLeaveCancellationSchema = z.object({
  body: z
    .object({
      note: workflowNoteSchema,
    })
    .strict(),

  params: leaveRequestParamsSchema,

  query: z.object({}).strict().optional(),
});
