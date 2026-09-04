import { z } from "zod";

/**
 * ============================================================
 * COMMON
 * ============================================================
 */

const objectIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId.");

const nullableObjectIdSchema = z.union([objectIdSchema, z.null()]).optional();

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.");

const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());

const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const statusQuerySchema = (values) => z.enum(values).optional();

const emptyBodySchema = z.object({}).strict().optional();

const emptyQuerySchema = z.object({}).strict().optional();

/**
 * ============================================================
 * GPS / LOCATION EVIDENCE
 * ============================================================
 *
 * Frontend sends raw GPS facts only.
 *
 * Backend calculates:
 * - withinGeofence
 * - distanceFromLocationMeters
 */

const locationEvidenceInputSchema = z
  .object({
    latitude: z.number().min(-90).max(90),

    longitude: z.number().min(-180).max(180),

    accuracy: z.number().min(0).max(100000).optional().nullable(),

    capturedAt: isoDateTimeSchema.optional(),

    attendanceLocationId: nullableObjectIdSchema,

    addressText: z.string().trim().max(500).optional().default(""),
  })
  .strict();

/**
 * ============================================================
 * ROUTE PARAMS
 * ============================================================
 */

export const attendanceCompanyParamsSchema = z
  .object({
    companyId: objectIdSchema,
  })
  .strict();

export const attendanceIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    attendanceId: objectIdSchema,
  })
  .strict();

export const shiftIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    shiftId: objectIdSchema,
  })
  .strict();

export const attendancePolicyIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    policyId: objectIdSchema,
  })
  .strict();

export const attendanceLocationIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    locationId: objectIdSchema,
  })
  .strict();

export const regularizationIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    regularizationId: objectIdSchema,
  })
  .strict();

export const fieldVisitIdParamsSchema = z
  .object({
    companyId: objectIdSchema,

    fieldVisitId: objectIdSchema,
  })
  .strict();

/**
 * ============================================================
 * MY TODAY ATTENDANCE
 * ============================================================
 */

export const getMyTodayAttendanceSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * CHECK IN
 * ============================================================
 */

export const checkInSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: z
    .object({
      location: locationEvidenceInputSchema.optional().nullable(),

      /**
       * Optional approved location selected by frontend.
       *
       * Backend still validates:
       * - company ownership
       * - status
       * - effective dates
       * - geofence
       */
      attendanceLocationId: nullableObjectIdSchema,

      notes: z.string().trim().max(1000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

/**
 * ============================================================
 * CHECK OUT
 * ============================================================
 */

export const checkOutSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: z
    .object({
      location: locationEvidenceInputSchema.optional().nullable(),

      attendanceLocationId: nullableObjectIdSchema,

      notes: z.string().trim().max(1000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

/**
 * ============================================================
 * START BREAK
 * ============================================================
 */

export const startBreakSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: z
    .object({
      type: z.enum(["LUNCH", "TEA", "PERSONAL", "OTHER"]).default("OTHER"),

      notes: z.string().trim().max(500).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

/**
 * ============================================================
 * END BREAK / RESUME WORK
 * ============================================================
 */

export const endBreakSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: z
    .object({
      notes: z.string().trim().max(500).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

/**
 * ============================================================
 * ATTENDANCE LIST
 * ============================================================
 */

export const listAttendanceSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      employeeId: objectIdSchema.optional(),

      companyAccessId: objectIdSchema.optional(),

      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      shiftId: objectIdSchema.optional(),

      attendanceMode: z
        .enum(["OFFICE", "FIELD", "HYBRID", "REMOTE"])
        .optional(),

      attendanceStatus: statusQuerySchema([
        "PENDING",
        "PRESENT",
        "HALF_DAY",
        "ABSENT",
        "ON_LEAVE",
        "HOLIDAY",
        "WEEKLY_OFF",
      ]),

      calculationStatus: statusQuerySchema([
        "PENDING",
        "CALCULATED",
        "RECALCULATION_REQUIRED",
      ]),

      payrollStatus: statusQuerySchema([
        "NOT_PROCESSED",
        "INCLUDED",
        "FINALIZED",
      ]),

      date: dateStringSchema.optional(),

      fromDate: dateStringSchema.optional(),

      toDate: dateStringSchema.optional(),

      isLate: z.coerce.boolean().optional(),

      isEarlyCheckout: z.coerce.boolean().optional(),

      search: z.string().trim().max(150).optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});

/**
 * ============================================================
 * MY ATTENDANCE HISTORY
 * ============================================================
 */

export const getMyAttendanceHistorySchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      attendanceStatus: statusQuerySchema([
        "PENDING",
        "PRESENT",
        "HALF_DAY",
        "ABSENT",
        "ON_LEAVE",
        "HOLIDAY",
        "WEEKLY_OFF",
      ]),

      calculationStatus: statusQuerySchema([
        "PENDING",
        "CALCULATED",
        "RECALCULATION_REQUIRED",
      ]),

      date: dateStringSchema.optional(),

      fromDate: dateStringSchema.optional(),

      toDate: dateStringSchema.optional(),

      isLate: z.coerce.boolean().optional(),

      isEarlyCheckout: z.coerce.boolean().optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});

/**
 * ============================================================
 * GET ATTENDANCE
 * ============================================================
 */

export const getAttendanceSchema = z.object({
  params: attendanceIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * ATTENDANCE ADJUSTMENT
 * ============================================================
 */

export const adjustAttendanceSchema = z.object({
  params: attendanceIdParamsSchema,

  body: z
    .object({
      type: z.enum([
        "REQUIRED_WORK_MINUTES",
        "BREAK_ALLOWANCE",
        "LATE_GRACE",
        "EARLY_CHECKOUT_GRACE",
        "OTHER",
      ]),

      minutes: z.number().int().min(-1440).max(1440),

      reason: z
        .string()
        .trim()
        .min(3, "Adjustment reason is required.")
        .max(1000),
    })
    .strict(),

  query: emptyQuerySchema,
});

/**
 * ============================================================
 * SHIFT
 * ============================================================
 */

const shiftBaseSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Shift code may contain letters, numbers, underscores and hyphens only.",
      )
      .transform((value) => value.toUpperCase()),

    description: z.string().trim().max(500).optional().default(""),

    startTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "startTime must use HH:mm format."),

    endTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "endTime must use HH:mm format."),

    isOvernight: z.boolean().default(false),

    fullDayMinutes: z.number().int().min(1).max(1440),

    halfDayMinutes: z.number().int().min(1).max(1440),

    lateGraceMinutes: z.number().int().min(0).max(720).default(0),

    earlyCheckoutGraceMinutes: z.number().int().min(0).max(720).default(0),

    standardBreakMinutes: z.number().int().min(0).max(720).default(0),

    maxBreakMinutes: z.number().int().min(0).max(720).default(0),

    allowMultipleBreaks: z.boolean().default(true),

    workingDays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine(
        (days) => new Set(days).size === days.length,
        "Working days must be unique.",
      )
      .default([1, 2, 3, 4, 5, 6]),

    effectiveFrom: isoDateTimeSchema.optional().nullable(),

    effectiveTo: isoDateTimeSchema.optional().nullable(),

    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

const validateShiftBusinessRules = (data, ctx) => {
  if (
    data.halfDayMinutes !== undefined &&
    data.fullDayMinutes !== undefined &&
    data.halfDayMinutes > data.fullDayMinutes
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["halfDayMinutes"],
      message: "Half-day minutes cannot exceed full-day minutes.",
    });
  }

  if (
    data.maxBreakMinutes !== undefined &&
    data.standardBreakMinutes !== undefined &&
    data.maxBreakMinutes < data.standardBreakMinutes
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxBreakMinutes"],
      message: "Maximum break minutes cannot be below standard break minutes.",
    });
  }

  if (
    data.effectiveFrom &&
    data.effectiveTo &&
    new Date(data.effectiveTo) < new Date(data.effectiveFrom)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Shift effective-to cannot be earlier than effective-from.",
    });
  }

  if (
    data.isOvernight === false &&
    data.startTime &&
    data.endTime &&
    data.startTime === data.endTime
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "Normal shift start time and end time cannot be the same.",
    });
  }
};

const shiftBodySchema = shiftBaseSchema.superRefine(validateShiftBusinessRules);

const updateShiftBodySchema = shiftBaseSchema
  .partial()
  .refine(
    (body) => Object.keys(body).length > 0,
    "At least one shift field must be provided.",
  )
  .superRefine(validateShiftBusinessRules);

export const createShiftSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: shiftBodySchema,

  query: emptyQuerySchema,
});

export const updateShiftSchema = z.object({
  params: shiftIdParamsSchema,

  body: updateShiftBodySchema,

  query: emptyQuerySchema,
});

export const listShiftsSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      search: z.string().trim().max(150).optional(),

      effectiveOn: dateStringSchema.optional(),
    })
    .strict(),

  body: emptyBodySchema,
});

export const getShiftSchema = z.object({
  params: shiftIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * ATTENDANCE POLICY
 * ============================================================
 */

const attendancePolicyBaseSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Policy code may contain letters, numbers, underscores and hyphens only.",
      )
      .transform((value) => value.toUpperCase()),

    description: z.string().trim().max(500).optional().default(""),

    locationRequired: z.boolean().default(true),

    maximumAcceptedAccuracyMeters: z.number().min(1).max(5000).default(100),

    enforceGeofenceForOffice: z.boolean().default(true),

    enforceGeofenceForHybrid: z.boolean().default(true),

    enforceGeofenceForField: z.boolean().default(false),

    enforceGeofenceForRemote: z.boolean().default(false),

    allowMultipleWorkSessions: z.boolean().default(true),

    allowReCheckInSameDay: z.boolean().default(true),

    preventOverlappingSessions: z.boolean().default(true),

    missingCheckoutAction: z
      .enum(["FLAG_ONLY", "AUTO_CLOSE", "REQUIRE_REGULARIZATION"])
      .default("REQUIRE_REGULARIZATION"),

    autoCloseAfterMinutes: z.number().int().min(0).max(1440).default(120),

    maximumOpenSessionMinutes: z.number().int().min(1).max(2880).default(960),

    allowNextDayCheckInWithPendingPreviousDay: z.boolean().default(true),

    regularizationEnabled: z.boolean().default(true),

    regularizationWindowDays: z.number().int().min(0).max(365).default(7),

    requireRegularizationReason: z.boolean().default(true),

    allowCheckInCorrection: z.boolean().default(true),

    allowCheckOutCorrection: z.boolean().default(true),

    allowBreakCorrection: z.boolean().default(true),

    fieldVisitEnabled: z.boolean().default(true),

    // fieldVisitLocationRequired: z.boolean().default(true),

    fieldVisitPurposeRequired: z.boolean().default(true),

    fieldVisitOutcomeRequired: z.boolean().default(false),

    effectiveFrom: isoDateTimeSchema,

    effectiveTo: isoDateTimeSchema.optional().nullable(),

    isDefault: z.boolean().default(false),

    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

const validateAttendancePolicyBusinessRules = (data, ctx) => {
  if (
    data.effectiveFrom &&
    data.effectiveTo &&
    new Date(data.effectiveTo) < new Date(data.effectiveFrom)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Policy effective-to cannot be earlier than effective-from.",
    });
  }

  if (
    data.missingCheckoutAction === "AUTO_CLOSE" &&
    data.maximumOpenSessionMinutes !== undefined &&
    data.autoCloseAfterMinutes !== undefined &&
    data.maximumOpenSessionMinutes < data.autoCloseAfterMinutes
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maximumOpenSessionMinutes"],
      message:
        "Maximum open session minutes cannot be below auto-close minutes.",
    });
  }
};

const attendancePolicyBodySchema = attendancePolicyBaseSchema.superRefine(
  validateAttendancePolicyBusinessRules,
);

const updateAttendancePolicyBodySchema = attendancePolicyBaseSchema
  .partial()
  .refine(
    (body) => Object.keys(body).length > 0,
    "At least one attendance policy field must be provided.",
  )
  .superRefine(validateAttendancePolicyBusinessRules);

export const createAttendancePolicySchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: attendancePolicyBodySchema,

  query: emptyQuerySchema,
});

export const updateAttendancePolicySchema = z.object({
  params: attendancePolicyIdParamsSchema,

  body: updateAttendancePolicyBodySchema,

  query: emptyQuerySchema,
});

export const listAttendancePoliciesSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      isDefault: z.coerce.boolean().optional(),

      effectiveOn: dateStringSchema.optional(),

      search: z.string().trim().max(150).optional(),
    })
    .strict(),

  body: emptyBodySchema,
});

export const getAttendancePolicySchema = z.object({
  params: attendancePolicyIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * ATTENDANCE LOCATION
 * ============================================================
 */

const addressSchema = z
  .object({
    addressLine1: z.string().trim().max(200).optional().default(""),

    addressLine2: z.string().trim().max(200).optional().default(""),

    city: z.string().trim().max(100).optional().default(""),

    district: z.string().trim().max(100).optional().default(""),

    state: z.string().trim().max(100).optional().default(""),

    country: z.string().trim().max(100).optional().default(""),

    postalCode: z.string().trim().max(20).optional().default(""),
  })
  .strict();

const attendanceLocationBaseSchema = z
  .object({
    name: z.string().trim().min(2).max(150),

    code: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        "Location code may contain letters, numbers, underscores and hyphens only.",
      )
      .transform((value) => value.toUpperCase()),

    description: z.string().trim().max(500).optional().default(""),

    locationType: z
      .enum([
        "OFFICE",
        "BRANCH",
        "WAREHOUSE",
        "PROJECT_SITE",
        "CLIENT_SITE",
        "OTHER",
      ])
      .default("OFFICE"),

    clientId: nullableObjectIdSchema,

    address: addressSchema.optional(),

    latitude: z.number().min(-90).max(90),

    longitude: z.number().min(-180).max(180),

    geofenceRadiusMeters: z.number().min(10).max(10000),

    allowCheckIn: z.boolean().default(true),

    allowCheckOut: z.boolean().default(true),

    allowFieldVisit: z.boolean().default(false),

    isDefault: z.boolean().default(false),

    effectiveFrom: isoDateTimeSchema.optional().nullable(),

    effectiveTo: isoDateTimeSchema.optional().nullable(),

    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .strict();

const validateAttendanceLocationBusinessRules = (data, ctx) => {
  if (data.locationType === "CLIENT_SITE" && !data.clientId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["clientId"],
      message: "clientId is required for CLIENT_SITE attendance locations.",
    });
  }

  if (
    data.effectiveFrom &&
    data.effectiveTo &&
    new Date(data.effectiveTo) < new Date(data.effectiveFrom)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Location effective-to cannot be earlier than effective-from.",
    });
  }
};

const attendanceLocationBodySchema = attendanceLocationBaseSchema.superRefine(
  validateAttendanceLocationBusinessRules,
);

const updateAttendanceLocationBodySchema = attendanceLocationBaseSchema
  .partial()
  .refine(
    (body) => Object.keys(body).length > 0,
    "At least one attendance location field must be provided.",
  )
  .superRefine(validateAttendanceLocationBusinessRules);

export const createAttendanceLocationSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: attendanceLocationBodySchema,

  query: emptyQuerySchema,
});

export const updateAttendanceLocationSchema = z.object({
  params: attendanceLocationIdParamsSchema,

  body: updateAttendanceLocationBodySchema,

  query: emptyQuerySchema,
});

export const listAttendanceLocationsSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),

      locationType: z
        .enum([
          "OFFICE",
          "BRANCH",
          "WAREHOUSE",
          "PROJECT_SITE",
          "CLIENT_SITE",
          "OTHER",
        ])
        .optional(),

      clientId: objectIdSchema.optional(),

      isDefault: z.coerce.boolean().optional(),

      effectiveOn: dateStringSchema.optional(),

      search: z.string().trim().max(150).optional(),
    })
    .strict(),

  body: emptyBodySchema,
});

export const getAttendanceLocationSchema = z.object({
  params: attendanceLocationIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

/**
 * ============================================================
 * REGULARIZATION
 * ============================================================
 */

export const createRegularizationSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: z
    .object({
      attendanceId: objectIdSchema.optional().nullable(),

      targetWorkSessionId: objectIdSchema.optional().nullable(),

      targetBreakId: objectIdSchema.optional().nullable(),

      requestType: z.enum([
        "MISSING_CHECK_IN",
        "MISSING_CHECKOUT",
        "CHECK_IN_TIME_CORRECTION",
        "CHECKOUT_TIME_CORRECTION",
        "BREAK_CORRECTION",
        "BREAK_EXTENSION",
        "OTHER",
      ]),

      requestedCheckInAt: isoDateTimeSchema.optional().nullable(),

      requestedCheckOutAt: isoDateTimeSchema.optional().nullable(),

      requestedBreakStartAt: isoDateTimeSchema.optional().nullable(),

      requestedBreakEndAt: isoDateTimeSchema.optional().nullable(),

      requestedBreakExtensionMinutes: z
        .number()
        .int()
        .min(0)
        .max(720)
        .optional()
        .nullable(),

      locationEvidence: locationEvidenceInputSchema.optional().nullable(),

      reason: z.string().trim().min(3).max(1500),

      attachmentUrl: z.string().trim().max(1000).optional().default(""),
    })
    .strict()
    .superRefine((data, ctx) => {
      /**
       * ======================================================
       * TARGET SESSION / BREAK VALIDATION
       * ======================================================
       *
       * Attendance can contain multiple work sessions and
       * multiple breaks. Correction requests must identify
       * exactly which embedded record is being corrected.
       */

      if (
        [
          "MISSING_CHECKOUT",
          "CHECK_IN_TIME_CORRECTION",
          "CHECKOUT_TIME_CORRECTION",
        ].includes(data.requestType) &&
        !data.targetWorkSessionId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetWorkSessionId"],
          message:
            "Target work session is required for this regularization type.",
        });
      }

      if (
        ["BREAK_CORRECTION", "BREAK_EXTENSION"].includes(data.requestType) &&
        !data.targetBreakId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetBreakId"],
          message: "Target break is required for this regularization type.",
        });
      }

      /**
       * ======================================================
       * REQUESTED VALUE VALIDATION
       * ======================================================
       */

      if (
        ["MISSING_CHECK_IN", "CHECK_IN_TIME_CORRECTION"].includes(
          data.requestType,
        ) &&
        !data.requestedCheckInAt
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestedCheckInAt"],
          message: "Requested check-in time is required for this request type.",
        });
      }

      if (
        [
          "MISSING_CHECK_IN",
          "MISSING_CHECKOUT",
          "CHECKOUT_TIME_CORRECTION",
        ].includes(data.requestType) &&
        !data.requestedCheckOutAt
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestedCheckOutAt"],
          message: "Requested checkout time is required for this request type.",
        });
      }

      if (
        data.requestType === "MISSING_CHECK_IN" &&
        data.requestedCheckInAt &&
        data.requestedCheckOutAt &&
        new Date(data.requestedCheckOutAt) <= new Date(data.requestedCheckInAt)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestedCheckOutAt"],
          message:
            "Requested checkout time must be later than requested check-in time.",
        });
      }

      if (data.requestType === "BREAK_CORRECTION") {
        if (!data.requestedBreakStartAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["requestedBreakStartAt"],
            message: "Requested break start time is required.",
          });
        }

        if (!data.requestedBreakEndAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["requestedBreakEndAt"],
            message: "Requested break end time is required.",
          });
        }
      }

      if (
        data.requestedBreakStartAt &&
        data.requestedBreakEndAt &&
        new Date(data.requestedBreakEndAt) <
          new Date(data.requestedBreakStartAt)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestedBreakEndAt"],
          message:
            "Requested break end time cannot be earlier than start time.",
        });
      }

      if (
        data.requestType === "BREAK_EXTENSION" &&
        data.requestedBreakExtensionMinutes == null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requestedBreakExtensionMinutes"],
          message: "Requested break extension minutes are required.",
        });
      }
    }),

  query: emptyQuerySchema,
});

export const listRegularizationsSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      employeeId: objectIdSchema.optional(),

      companyAccessId: objectIdSchema.optional(),

      attendanceId: objectIdSchema.optional(),

      status: z
        .enum(["PENDING", "RECOMMENDED", "APPROVED", "REJECTED", "CANCELLED"])
        .optional(),

      requestType: z
        .enum([
          "MISSING_CHECK_IN",
          "MISSING_CHECKOUT",
          "CHECK_IN_TIME_CORRECTION",
          "CHECKOUT_TIME_CORRECTION",
          "BREAK_CORRECTION",
          "BREAK_EXTENSION",
          "OTHER",
        ])
        .optional(),

      fromDate: dateStringSchema.optional(),

      toDate: dateStringSchema.optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});

export const getRegularizationSchema = z.object({
  params: regularizationIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

export const recommendRegularizationSchema = z.object({
  params: regularizationIdParamsSchema,

  body: z
    .object({
      note: z.string().trim().max(1000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

export const approveRegularizationSchema = z.object({
  params: regularizationIdParamsSchema,

  body: z
    .object({
      note: z.string().trim().max(1000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

export const rejectRegularizationSchema = z.object({
  params: regularizationIdParamsSchema,

  body: z
    .object({
      reason: z.string().trim().min(3).max(1000),
    })
    .strict(),

  query: emptyQuerySchema,
});

export const cancelRegularizationSchema = z.object({
  params: regularizationIdParamsSchema,

  body: z
    .object({
      reason: z.string().trim().max(1000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

/**
 * ============================================================
 * FIELD VISIT
 * ============================================================
 */

const fieldVisitTypeSchema = z.enum([
  "CLIENT_VISIT",
  "PROJECT_SITE",
  "SALES_VISIT",
  "VENDOR_VISIT",
  "DELIVERY",
  "COLLECTION",
  "OFFICIAL_ERRAND",
  "OTHER",
]);

const fieldVisitStatusSchema = z.enum([
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const startFieldVisitSchema = z.object({
  params: attendanceCompanyParamsSchema,

  body: z
    .object({
      visitType: fieldVisitTypeSchema.default("CLIENT_VISIT"),

      clientId: nullableObjectIdSchema,

      siteName: z.string().trim().max(200).optional().default(""),

      purpose: z
        .string()
        .trim()
        .min(2, "Field visit purpose is required.")
        .max(1500),

      location: locationEvidenceInputSchema,

      notes: z.string().trim().max(2000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

export const endFieldVisitSchema = z.object({
  params: fieldVisitIdParamsSchema,

  body: z
    .object({
      location: locationEvidenceInputSchema,

      outcome: z.string().trim().max(2000).optional().default(""),

      notes: z.string().trim().max(2000).optional().default(""),
    })
    .strict(),

  query: emptyQuerySchema,
});

export const cancelFieldVisitSchema = z.object({
  params: fieldVisitIdParamsSchema,

  body: z
    .object({
      reason: z
        .string()
        .trim()
        .min(3, "Cancellation reason is required.")
        .max(1000),
    })
    .strict(),

  query: emptyQuerySchema,
});

export const getMyActiveFieldVisitSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});

export const getMyFieldVisitHistorySchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      clientId: objectIdSchema.optional(),

      visitType: fieldVisitTypeSchema.optional(),

      status: fieldVisitStatusSchema.optional(),

      date: dateStringSchema.optional(),

      fromDate: dateStringSchema.optional(),

      toDate: dateStringSchema.optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});

export const listFieldVisitsSchema = z.object({
  params: attendanceCompanyParamsSchema,

  query: z
    .object({
      ...paginationQuerySchema,

      employeeId: objectIdSchema.optional(),

      companyAccessId: objectIdSchema.optional(),

      departmentId: objectIdSchema.optional(),

      teamId: objectIdSchema.optional(),

      attendanceId: objectIdSchema.optional(),

      clientId: objectIdSchema.optional(),

      visitType: fieldVisitTypeSchema.optional(),

      status: fieldVisitStatusSchema.optional(),

      date: dateStringSchema.optional(),

      fromDate: dateStringSchema.optional(),

      toDate: dateStringSchema.optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.fromDate && data.toDate && data.toDate < data.fromDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["toDate"],
          message: "toDate cannot be earlier than fromDate.",
        });
      }
    }),

  body: emptyBodySchema,
});

export const getFieldVisitSchema = z.object({
  params: fieldVisitIdParamsSchema,

  query: emptyQuerySchema,

  body: emptyBodySchema,
});
