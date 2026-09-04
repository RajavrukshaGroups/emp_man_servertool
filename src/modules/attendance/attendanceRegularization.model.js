import mongoose from "mongoose";

/**
 * ============================================================
 * ATTENDANCE REGULARIZATION
 * ============================================================
 *
 * Used when attendance needs correction/regularization.
 *
 * Examples:
 *
 * - Missed check-in
 * - Missed checkout
 * - Wrong check-in/check-out time
 * - Break correction
 * - Approved break extension
 *
 * IMPORTANT:
 * Raw attendance evidence should not be silently overwritten.
 * Approved regularization is applied through the service layer
 * and remains fully auditable.
 */

const regularizationLocationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      default: null,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      default: null,
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
      default: null,
    },
  },
  {
    _id: false,
  },
);

const attendanceRegularizationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
      index: true,
    },

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
     * TARGET ATTENDANCE EVENT
     * ========================================================
     *
     * Identifies the exact session/break being corrected.
     *
     * Attendance supports multiple work sessions and breaks,
     * therefore the service must never guess which event the
     * employee intended to regularize.
     */

    targetWorkSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    targetBreakId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    /**
     * ========================================================
     * REQUEST TYPE
     * ========================================================
     */

    requestType: {
      type: String,
      enum: [
        "MISSING_CHECK_IN",
        "MISSING_CHECKOUT",
        "CHECK_IN_TIME_CORRECTION",
        "CHECKOUT_TIME_CORRECTION",
        "BREAK_CORRECTION",
        "BREAK_EXTENSION",
        "OTHER",
      ],
      required: [true, "Regularization request type is required."],
      index: true,
    },

    /**
     * ========================================================
     * REQUESTED VALUES
     * ========================================================
     *
     * Only relevant fields need to be supplied depending on
     * requestType.
     */

    requestedCheckInAt: {
      type: Date,
      default: null,
    },

    requestedCheckOutAt: {
      type: Date,
      default: null,
    },

    requestedBreakStartAt: {
      type: Date,
      default: null,
    },

    requestedBreakEndAt: {
      type: Date,
      default: null,
    },

    requestedBreakExtensionMinutes: {
      type: Number,
      default: null,
      min: [0, "Requested break extension minutes cannot be negative."],
      max: [720, "Requested break extension cannot exceed 720 minutes."],
    },

    /**
     * ========================================================
     * ORIGINAL VALUE SNAPSHOT
     * ========================================================
     *
     * Captured when the request is created.
     *
     * These fields preserve the original attendance facts even
     * if an approved regularization later updates Attendance.
     */

    originalCheckInAt: {
      type: Date,
      default: null,
    },

    originalCheckOutAt: {
      type: Date,
      default: null,
    },

    originalBreakStartAt: {
      type: Date,
      default: null,
    },

    originalBreakEndAt: {
      type: Date,
      default: null,
    },

    originalBreakDurationMinutes: {
      type: Number,
      default: null,
      min: 0,
    },

    locationEvidence: {
      type: regularizationLocationSchema,
      default: null,
    },

    reason: {
      type: String,
      required: [true, "Regularization reason is required."],
      trim: true,
      maxlength: [1500, "Regularization reason cannot exceed 1500 characters."],
    },

    /**
     * Optional supporting document/image URL.
     *
     * Example:
     * field work proof,
     * manager confirmation,
     * client visit document.
     */
    attachmentUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    /**
     * ========================================================
     * WORKFLOW
     * ========================================================
     */

    status: {
      type: String,
      enum: ["PENDING", "RECOMMENDED", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },

    /**
     * Team Lead / reporting manager recommendation.
     *
     * We keep recommendation separate from final approval.
     */
    recommendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    recommendedAt: {
      type: Date,
      default: null,
    },

    recommendationNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    /**
     * HR/Admin final approval.
     */
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    approvalNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    /**
     * ========================================================
     * APPLICATION STATE
     * ========================================================
     *
     * Approval and actual application are intentionally
     * separate.
     *
     * Example:
     *
     * APPROVED
     *     ↓
     * apply correction to Attendance
     *     ↓
     * recalculation
     */

    applicationStatus: {
      type: String,
      enum: ["NOT_APPLIED", "APPLIED", "FAILED"],
      default: "NOT_APPLIED",
      index: true,
    },

    appliedAt: {
      type: Date,
      default: null,
    },

    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    applicationError: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1500,
    },

    /**
     * ========================================================
     * PAYROLL IMPACT
     * ========================================================
     *
     * Later if payroll has already been finalized,
     * we must not silently change the old salary calculation.
     */
    affectsFinalizedPayroll: {
      type: Boolean,
      default: false,
      index: true,
    },

    payrollAdjustmentRequired: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * ========================================================
     * AUDIT / SOFT DELETE
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

attendanceRegularizationSchema.index({
  companyId: 1,
  companyAccessId: 1,
  attendanceDate: -1,
  isDeleted: 1,
});

attendanceRegularizationSchema.index({
  companyId: 1,
  status: 1,
  createdAt: -1,
  isDeleted: 1,
});

attendanceRegularizationSchema.index({
  companyId: 1,
  attendanceId: 1,
  status: 1,
  isDeleted: 1,
});

attendanceRegularizationSchema.index({
  companyId: 1,
  requestType: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

attendanceRegularizationSchema.pre("validate", function () {
  /**
   * Exact target session is required for corrections that
   * operate on an existing work session.
   *
   * MISSING_CHECK_IN is intentionally excluded because a true
   * missed check-in may not have an existing target session.
   */
  if (
    [
      "MISSING_CHECKOUT",
      "CHECK_IN_TIME_CORRECTION",
      "CHECKOUT_TIME_CORRECTION",
    ].includes(this.requestType) &&
    !this.targetWorkSessionId
  ) {
    throw new Error(
      "Target work session is required for this regularization type.",
    );
  }

  /**
   * Break corrections must identify the exact embedded break.
   */
  if (
    ["BREAK_CORRECTION", "BREAK_EXTENSION"].includes(this.requestType) &&
    !this.targetBreakId
  ) {
    throw new Error("Target break is required for this regularization type.");
  }
  if (
    [
      "MISSING_CHECK_IN",
      "MISSING_CHECKOUT",
      "CHECKOUT_TIME_CORRECTION",
    ].includes(this.requestType) &&
    !this.requestedCheckOutAt
  ) {
    throw new Error(
      "Requested checkout time is required for this regularization type.",
    );
  }

  if (
    this.requestType === "MISSING_CHECK_IN" &&
    this.requestedCheckInAt &&
    this.requestedCheckOutAt &&
    new Date(this.requestedCheckOutAt) <= new Date(this.requestedCheckInAt)
  ) {
    throw new Error(
      "Requested checkout time must be later than requested check-in time.",
    );
  }

  if (
    ["MISSING_CHECKOUT", "CHECKOUT_TIME_CORRECTION"].includes(
      this.requestType,
    ) &&
    !this.requestedCheckOutAt
  ) {
    throw new Error(
      "Requested checkout time is required for this regularization type.",
    );
  }

  if (
    this.requestType === "BREAK_CORRECTION" &&
    (!this.requestedBreakStartAt || !this.requestedBreakEndAt)
  ) {
    throw new Error(
      "Requested break start and end times are required for break correction.",
    );
  }

  if (
    this.requestedBreakStartAt &&
    this.requestedBreakEndAt &&
    new Date(this.requestedBreakEndAt) < new Date(this.requestedBreakStartAt)
  ) {
    throw new Error(
      "Requested break end time cannot be earlier than break start time.",
    );
  }

  if (
    this.requestType === "BREAK_EXTENSION" &&
    this.requestedBreakExtensionMinutes == null
  ) {
    throw new Error(
      "Requested break extension minutes are required for break extension.",
    );
  }

  if (this.status === "APPROVED" && (!this.approvedBy || !this.approvedAt)) {
    throw new Error(
      "Approved regularization must contain approver and approval time.",
    );
  }

  if (this.status === "REJECTED" && (!this.rejectedBy || !this.rejectedAt)) {
    throw new Error(
      "Rejected regularization must contain rejected-by and rejection time.",
    );
  }

  if (this.status === "CANCELLED" && (!this.cancelledBy || !this.cancelledAt)) {
    throw new Error(
      "Cancelled regularization must contain cancelled-by and cancellation time.",
    );
  }
});

const AttendanceRegularization = mongoose.model(
  "AttendanceRegularization",
  attendanceRegularizationSchema,
);

export default AttendanceRegularization;
