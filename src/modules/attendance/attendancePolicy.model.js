import mongoose from "mongoose";

/**
 * ============================================================
 * ATTENDANCE POLICY
 * ============================================================
 *
 * Company-level rules controlling how attendance is captured,
 * validated and corrected.
 *
 * Shift-specific timings and working-minute thresholds belong
 * to Shift, not AttendancePolicy.
 */

const attendancePolicySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Attendance policy name is required."],
      trim: true,
      maxlength: [100, "Attendance policy name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Attendance policy code is required."],
      trim: true,
      uppercase: true,
      maxlength: [50, "Attendance policy code cannot exceed 50 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        500,
        "Attendance policy description cannot exceed 500 characters.",
      ],
    },

    /**
     * ========================================================
     * LOCATION / GPS
     * ========================================================
     */

    /**
     * Whether GPS coordinates must be supplied when an
     * attendance event is created.
     *
     * Individual attendance modes can still affect whether
     * geofence enforcement itself is required.
     */
    locationRequired: {
      type: Boolean,
      default: true,
    },

    /**
     * Maximum acceptable GPS accuracy.
     *
     * Browser/mobile GPS may return:
     *
     * accuracy = 20m
     * accuracy = 60m
     * accuracy = 500m
     *
     * Large values may be rejected because they cannot prove
     * the employee is actually inside the allowed location.
     */
    maximumAcceptedAccuracyMeters: {
      type: Number,
      default: 100,
      min: [1, "Maximum accepted GPS accuracy must be greater than 0."],
      max: [5000, "Maximum accepted GPS accuracy cannot exceed 5000 meters."],
    },

    /**
     * OFFICE mode normally requires geofence validation.
     */
    enforceGeofenceForOffice: {
      type: Boolean,
      default: true,
    },

    /**
     * HYBRID employees may work either from approved office/site
     * locations or as field employees depending on the event.
     */
    enforceGeofenceForHybrid: {
      type: Boolean,
      default: true,
    },

    /**
     * FIELD employees generally capture GPS evidence without
     * necessarily being inside an office geofence.
     */
    enforceGeofenceForField: {
      type: Boolean,
      default: false,
    },

    /**
     * REMOTE employees can capture GPS evidence while geofence
     * enforcement remains disabled.
     */
    enforceGeofenceForRemote: {
      type: Boolean,
      default: false,
    },

    /**
     * ========================================================
     * CHECK-IN / CHECK-OUT
     * ========================================================
     */

    allowMultipleWorkSessions: {
      type: Boolean,
      default: true,
    },

    /**
     * Determines whether employee can check in again after
     * ending a work session on the same attendance day.
     */
    allowReCheckInSameDay: {
      type: Boolean,
      default: true,
    },

    /**
     * Prevents accidental overlapping sessions.
     *
     * We will also enforce this in attendance.service.js.
     */
    preventOverlappingSessions: {
      type: Boolean,
      default: true,
    },

    /**
     * ========================================================
     * MISSING CHECKOUT
     * ========================================================
     */

    missingCheckoutAction: {
      type: String,
      enum: ["FLAG_ONLY", "AUTO_CLOSE", "REQUIRE_REGULARIZATION"],
      default: "REQUIRE_REGULARIZATION",
    },

    /**
     * If AUTO_CLOSE is selected, this decides how long after
     * expected shift end the system may close the open session.
     *
     * Example:
     * Shift ends 18:30
     * autoCloseAfterMinutes = 120
     *
     * System closes at approximately 20:30.
     */
    autoCloseAfterMinutes: {
      type: Number,
      default: 120,
      min: [0, "Auto-close minutes cannot be negative."],
      max: [1440, "Auto-close minutes cannot exceed 1440 minutes."],
    },

    /**
     * Absolute safety limit for an accidentally open session.
     *
     * This prevents an employee who forgot checkout from
     * accumulating an impossible amount of worked time.
     *
     * Example:
     * 960 = 16 hours.
     */
    maximumOpenSessionMinutes: {
      type: Number,
      default: 960,
      min: [1, "Maximum open session duration must be greater than 0."],
      max: [2880, "Maximum open session duration cannot exceed 2880 minutes."],
    },

    /**
     * Employee should normally be allowed to start the next
     * day's attendance even if the previous day contains a
     * missing-checkout anomaly.
     */
    allowNextDayCheckInWithPendingPreviousDay: {
      type: Boolean,
      default: true,
    },

    /**
     * ========================================================
     * REGULARIZATION / CORRECTION
     * ========================================================
     */

    regularizationEnabled: {
      type: Boolean,
      default: true,
    },

    /**
     * How many days after the attendance date an employee may
     * request a correction.
     *
     * Example:
     * 7 means a record from Monday can normally be corrected
     * until the following Monday.
     */
    regularizationWindowDays: {
      type: Number,
      default: 7,
      min: [0, "Regularization window cannot be negative."],
      max: [365, "Regularization window cannot exceed 365 days."],
    },

    requireRegularizationReason: {
      type: Boolean,
      default: true,
    },

    /**
     * Whether employees may request correction of check-in time.
     */
    allowCheckInCorrection: {
      type: Boolean,
      default: true,
    },

    /**
     * Whether employees may request correction of checkout time.
     */
    allowCheckOutCorrection: {
      type: Boolean,
      default: true,
    },

    /**
     * Whether break-related corrections/extension requests
     * are permitted.
     */
    allowBreakCorrection: {
      type: Boolean,
      default: true,
    },

    /**
     * ========================================================
     * FIELD / CLIENT WORK
     * ========================================================
     */

    fieldVisitEnabled: {
      type: Boolean,
      default: true,
    },

    /**
     * Require location evidence when starting or ending
     * a field/client visit.
     */
    fieldVisitLocationRequired: {
      type: Boolean,
      default: true,
    },

    /**
     * Require employee to give a purpose before starting
     * a field/client visit.
     */
    fieldVisitPurposeRequired: {
      type: Boolean,
      default: true,
    },

    /**
     * Optionally require field visit employee to provide
     * an outcome/note when ending the visit.
     */
    fieldVisitOutcomeRequired: {
      type: Boolean,
      default: false,
    },

    /**
     * ========================================================
     * EFFECTIVE-DATED POLICY
     * ========================================================
     *
     * Never overwrite historical attendance policy meaning.
     *
     * If policy changes, we can close the old policy using
     * effectiveTo and create a new version.
     */

    effectiveFrom: {
      type: Date,
      required: [true, "Policy effective-from date is required."],
      index: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },

    /**
     * A company may nominate one policy as the normal/default
     * attendance policy.
     *
     * The service layer will ensure only one applicable default
     * policy exists for the company at a given time.
     */
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
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
 * Policy codes are unique inside a company while active
 * in the database.
 *
 * Soft-deleted policies do not prevent reuse of the code.
 */
attendancePolicySchema.index(
  {
    companyId: 1,
    code: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * Used when resolving current policy.
 */
attendancePolicySchema.index({
  companyId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  isDeleted: 1,
});

/**
 * Used when resolving the company's default policy.
 */
attendancePolicySchema.index({
  companyId: 1,
  isDefault: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

attendancePolicySchema.pre("validate", function () {
  /**
   * Normalize policy code.
   */
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }

  /**
   * Validate effective date range.
   */
  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    new Date(this.effectiveTo) < new Date(this.effectiveFrom)
  ) {
    throw new Error(
      "Attendance policy effectiveTo cannot be before effectiveFrom.",
    );
  }

  /**
   * AUTO_CLOSE cannot happen after the maximum
   * allowed open-session duration.
   */
  if (
    this.missingCheckoutAction === "AUTO_CLOSE" &&
    this.autoCloseAfterMinutes > this.maximumOpenSessionMinutes
  ) {
    throw new Error(
      "autoCloseAfterMinutes cannot exceed maximumOpenSessionMinutes.",
    );
  }
});

const AttendancePolicy = mongoose.model(
  "AttendancePolicy",
  attendancePolicySchema,
);

export default AttendancePolicy;
