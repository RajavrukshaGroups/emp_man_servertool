import mongoose from "mongoose";

/**
 * ============================================================
 * LOCATION EVIDENCE
 * ============================================================
 *
 * Raw location evidence captured during an attendance event.
 *
 * IMPORTANT:
 * `withinGeofence` is determined by the backend.
 * It must never be trusted from the frontend.
 */
const locationEvidenceSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },

    accuracy: {
      type: Number,
      default: null,
      min: 0,
    },

    capturedAt: {
      type: Date,
      required: true,
    },

    attendanceLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceLocation",
      default: null,
    },

    distanceFromLocationMeters: {
      type: Number,
      default: null,
      min: 0,
    },

    withinGeofence: {
      type: Boolean,
      default: null,
    },

    ipAddress: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    userAgent: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
  },
  {
    _id: false,
  },
);

/**
 * One employee may have multiple work sessions in one day.
 *
 * Example:
 *
 * 09:30 -> 13:00
 * 14:00 -> 18:30
 *
 * The gap between sessions represents non-working time.
 *
 * Explicit lunch/tea/personal breaks are stored separately
 * in the `breaks` array.
 */
const workSessionSchema = new mongoose.Schema(
  {
    checkInAt: {
      type: Date,
      required: true,
    },

    checkOutAt: {
      type: Date,
      default: null,
    },
    checkInLocation: {
      type: locationEvidenceSchema,
      default: null,
    },

    checkOutLocation: {
      type: locationEvidenceSchema,
      default: null,
    },

    checkInSource: {
      type: String,
      enum: ["EMPLOYEE", "ADMIN_CORRECTION"],
      default: "EMPLOYEE",
    },

    checkOutSource: {
      type: String,
      enum: ["EMPLOYEE", "SYSTEM_AUTO_CLOSE", "ADMIN_CORRECTION"],
      default: null,
    },

    workedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
  },
  {
    timestamps: true,
  },
);

/**
 * ============================================================
 * BREAK
 * ============================================================
 *
 * Breaks are stored separately from work sessions so we can
 * preserve actual break evidence and support multiple breaks.
 */
const breakSchema = new mongoose.Schema(
  {
    startedAt: {
      type: Date,
      required: true,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    type: {
      type: String,
      enum: ["LUNCH", "TEA", "PERSONAL", "OTHER"],
      default: "OTHER",
    },

    /**
     * Note supplied when break starts.
     *
     * Example:
     * "Going for lunch."
     */
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Break notes cannot exceed 500 characters."],
    },

    /**
     * Note supplied when employee ends the break
     * and resumes work.
     *
     * Example:
     * "Lunch completed. Resuming work."
     */
    endNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Break end notes cannot exceed 500 characters."],
    },

    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED"],
      default: "ACTIVE",
    },
  },
  {
    _id: true,
    timestamps: true,
  },
);

/**
 * ============================================================
 * ATTENDANCE ANOMALY
 * ============================================================
 *
 * An anomaly is separate from attendance status.
 *
 * Example:
 *
 * Employee may still be PRESENT while having:
 *
 * MISSING_CHECKOUT
 * LATE_ARRIVAL
 */
const anomalySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "MISSING_CHECK_IN",
        "MISSING_CHECKOUT",
        "LATE_ARRIVAL",
        "EARLY_CHECKOUT",
        "EXCESSIVE_BREAK",
        "OUTSIDE_GEOFENCE",
        "LOW_LOCATION_ACCURACY",
        "OVERLAPPING_SESSION",
        "OTHER",
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["OPEN", "RESOLVED", "IGNORED"],
      default: "OPEN",
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    detectedAt: {
      type: Date,
      default: Date.now,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resolutionNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * ============================================================
 * ATTENDANCE ADJUSTMENT
 * ============================================================
 *
 * Adjustments change attendance evaluation WITHOUT falsifying
 * raw worked time.
 *
 * Example:
 *
 * actualWorkedMinutes = 440
 * required = 480
 * adjustment = -40 required minutes
 *
 * Actual work remains 440.
 */
const adjustmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "REQUIRED_WORK_MINUTES",
        "BREAK_ALLOWANCE",
        "LATE_GRACE",
        "EARLY_CHECKOUT_GRACE",
        "OTHER",
      ],
      required: true,
    },

    minutes: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    approvedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * ============================================================
 * MAIN ATTENDANCE SCHEMA
 * ============================================================
 */
const attendanceSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    /**
     * CompanyAccess is the authoritative employment context.
     */
    companyAccessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Company access is required."],
      index: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: [true, "Employee is required."],
      index: true,
    },

    /**
     * Logical attendance date in the company's timezone.
     *
     * Store as YYYY-MM-DD.
     *
     * Example:
     * "2026-08-31"
     *
     * This is intentionally separate from timestamps.
     */
    attendanceDate: {
      type: String,
      required: [true, "Attendance date is required."],
      match: [
        /^\d{4}-\d{2}-\d{2}$/,
        "Attendance date must use YYYY-MM-DD format.",
      ],
      index: true,
    },

    /**
     * ========================================================
     * SHIFT / POLICY REFERENCES
     * ========================================================
     *
     * Store references used for this attendance day.
     */
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      required: [true, "Shift is required."],
      index: true,
    },

    attendancePolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendancePolicy",
      required: [true, "Attendance policy is required."],
      index: true,
    },

    /**
     * Snapshot important values.
     *
     * This protects historical attendance calculations if a
     * shift/policy configuration changes later.
     */
    shiftSnapshot: {
      name: {
        type: String,
        required: true,
      },

      code: {
        type: String,
        required: true,
      },

      startTime: {
        type: String,
        required: true,
      },

      endTime: {
        type: String,
        required: true,
      },

      isOvernight: {
        type: Boolean,
        default: false,
      },

      fullDayMinutes: {
        type: Number,
        required: true,
      },

      halfDayMinutes: {
        type: Number,
        required: true,
      },

      lateGraceMinutes: {
        type: Number,
        default: 0,
      },

      earlyCheckoutGraceMinutes: {
        type: Number,
        default: 0,
      },

      standardBreakMinutes: {
        type: Number,
        default: 0,
      },

      maxBreakMinutes: {
        type: Number,
        default: 0,
      },

      allowMultipleBreaks: {
        type: Boolean,
        default: true,
      },
    },

    /**
     * Snapshot the schedule-compensation rules used for this
     * attendance day.
     *
     * Historical attendance must not change merely because the
     * company's attendance policy changes later.
     */
    compensationPolicySnapshot: {
      scheduleCompensationEnabled: {
        type: Boolean,
        default: true,
      },

      allowPostShiftWorkForLateArrival: {
        type: Boolean,
        default: true,
      },

      allowPreShiftWorkForEarlyCheckout: {
        type: Boolean,
        default: true,
      },

      maximumCompensationMinutes: {
        type: Number,
        default: 120,
        min: 0,
      },
    },

    /**
     * Snapshot the employee attendance mode for this day.
     *
     * Later changes to CompanyAccess must not alter history.
     */
    attendanceMode: {
      type: String,
      enum: ["OFFICE", "FIELD", "HYBRID", "REMOTE"],
      required: true,
    },

    /**
     * ========================================================
     * WORK/BREAK EVIDENCE
     * ========================================================
     */

    workSessions: {
      type: [workSessionSchema],
      default: [],
    },

    breaks: {
      type: [breakSchema],
      default: [],
    },

    /**
     * ========================================================
     * CALCULATED FACTS
     * ========================================================
     */

    firstCheckInAt: {
      type: Date,
      default: null,
    },

    lastCheckOutAt: {
      type: Date,
      default: null,
    },

    totalWorkedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalBreakMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    lateMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    earlyCheckoutMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    isLate: {
      type: Boolean,
      default: false,
    },

    isEarlyCheckout: {
      type: Boolean,
      default: false,
    },

    /**
     * ========================================================
     * SCHEDULE COMPENSATION
     * ========================================================
     *
     * IMPORTANT:
     *
     * Compensation does NOT erase the original schedule
     * deviation.
     *
     * isLate / lateMinutes and
     * isEarlyCheckout / earlyCheckoutMinutes
     *
     * always preserve what actually happened.
     */

    isLateCompensated: {
      type: Boolean,
      default: false,
    },

    lateCompensatedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    isEarlyCheckoutCompensated: {
      type: Boolean,
      default: false,
    },

    earlyCheckoutCompensatedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    /**
     * ========================================================
     * ATTENDANCE RESULT
     * ========================================================
     *
     * Leave/holiday/weekly-off integration will later participate
     * in the final monthly attendance summary.
     */
    attendanceStatus: {
      type: String,
      enum: [
        "PENDING",
        "PRESENT",
        "HALF_DAY",
        "ABSENT",
        "ON_LEAVE",
        "HOLIDAY",
        "WEEKLY_OFF",
      ],
      default: "PENDING",
      index: true,
    },

    /**
     * ========================================================
     * ANOMALIES / ADJUSTMENTS
     * ========================================================
     */

    anomalies: {
      type: [anomalySchema],
      default: [],
    },

    adjustments: {
      type: [adjustmentSchema],
      default: [],
    },

    /**
     * ========================================================
     * CALCULATION STATE
     * ========================================================
     *
     * Useful when attendance needs recalculation after an
     * approved regularization.
     */
    calculationStatus: {
      type: String,
      enum: ["PENDING", "CALCULATED", "RECALCULATION_REQUIRED"],
      default: "PENDING",
      index: true,
    },

    calculatedAt: {
      type: Date,
      default: null,
    },

    /**
     * ========================================================
     * PAYROLL STATE
     * ========================================================
     *
     * We aren't implementing payroll yet, but this protects
     * attendance records from silently changing after payroll
     * has consumed them.
     */
    payrollStatus: {
      type: String,
      enum: ["NOT_PROCESSED", "INCLUDED", "FINALIZED"],
      default: "NOT_PROCESSED",
      index: true,
    },

    payrollPeriod: {
      type: String,
      default: null,
      trim: true,
    },

    /**
     * ========================================================
     * NOTES
     * ========================================================
     */

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    /**
     * ========================================================
     * AUDIT
     * ========================================================
     */

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

/**
 * Exactly one attendance document per employee/company-access
 * per logical attendance date.
 *
 * Multiple check-ins are stored inside workSessions.
 */
attendanceSchema.index(
  {
    companyId: 1,
    companyAccessId: 1,
    attendanceDate: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * Employee attendance history.
 */
attendanceSchema.index({
  companyId: 1,
  employeeId: 1,
  attendanceDate: -1,
  isDeleted: 1,
});

/**
 * Company daily attendance.
 */
attendanceSchema.index({
  companyId: 1,
  attendanceDate: 1,
  attendanceStatus: 1,
  isDeleted: 1,
});

/**
 * Payroll/monthly processing.
 */
attendanceSchema.index({
  companyId: 1,
  payrollStatus: 1,
  attendanceDate: 1,
  isDeleted: 1,
});

/**
 * Records requiring recalculation.
 */
attendanceSchema.index({
  companyId: 1,
  calculationStatus: 1,
  attendanceDate: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

attendanceSchema.pre("validate", function () {
  const openSessions = this.workSessions.filter(
    (session) => session.status === "OPEN",
  );

  if (openSessions.length > 1) {
    throw new Error(
      "Attendance cannot contain more than one open work session.",
    );
  }

  const activeBreaks = this.breaks.filter(
    (breakItem) => breakItem.status === "ACTIVE",
  );

  if (activeBreaks.length > 1) {
    throw new Error("Attendance cannot contain more than one active break.");
  }

  for (const session of this.workSessions) {
    if (session.status === "CLOSED" && !session.checkOutAt) {
      throw new Error(
        "Closed attendance work session must contain checkout time.",
      );
    }

    if (
      session.checkOutAt &&
      session.checkInAt &&
      new Date(session.checkOutAt) < new Date(session.checkInAt)
    ) {
      throw new Error(
        "Attendance checkout time cannot be earlier than check-in time.",
      );
    }
  }

  for (const breakItem of this.breaks) {
    if (breakItem.status === "COMPLETED" && !breakItem.endedAt) {
      throw new Error("Completed attendance break must contain an end time.");
    }

    if (
      breakItem.endedAt &&
      breakItem.startedAt &&
      new Date(breakItem.endedAt) < new Date(breakItem.startedAt)
    ) {
      throw new Error(
        "Attendance break end time cannot be earlier than start time.",
      );
    }
  }
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
