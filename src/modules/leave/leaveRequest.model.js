import mongoose from "mongoose";

const LEAVE_REQUEST_STATUSES = [
  "PENDING",
  "RECOMMENDED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];

const halfDayIncrementValidator = {
  validator(value) {
    return (
      Number.isFinite(Number(value)) &&
      Number(value) >= 0 &&
      Number.isInteger(Number(value) * 2)
    );
  },
  message: "Leave days must use non-negative whole-day or half-day increments.",
};

const leaveDateDetailSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Leave date is required."],
    },

    /**
     * FULL_DAY: 1 day
     * FIRST_HALF: 0.5 day
     * SECOND_HALF: 0.5 day
     * NOT_APPLICABLE: excluded weekly off/holiday
     */
    dayPortion: {
      type: String,
      enum: ["FULL_DAY", "FIRST_HALF", "SECOND_HALF", "NOT_APPLICABLE"],
      required: [true, "Leave day portion is required."],
    },

    dayClassification: {
      type: String,
      enum: ["WORKING_DAY", "WEEKLY_OFF", "PUBLIC_HOLIDAY"],
      required: [true, "Leave day classification is required."],
    },

    leaveDays: {
      type: Number,
      required: [true, "Calculated leave days are required."],
      min: [0, "Calculated leave days cannot be negative."],
      max: [1, "Calculated leave days cannot exceed 1 per date."],
      validate: halfDayIncrementValidator,
    },

    countedAsLeave: {
      type: Boolean,
      required: true,
      default: true,
    },

    /**
     * How this specific leave date is financially allocated.
     *
     * PAID:
     *   Covered by the employee's selected paid leave entitlement.
     *
     * UNPAID:
     *   Not covered by the selected paid entitlement and therefore
     *   treated as Loss of Pay.
     *
     * NOT_APPLICABLE:
     *   Date is not counted as leave, for example an excluded
     *   weekly off or public holiday.
     */
    allocationType: {
      type: String,
      enum: ["PAID", "UNPAID", "NOT_APPLICABLE"],
      default: "PAID",
    },

    /**
     * Snapshot/reference of the actual leave type applied to this date.
     *
     * For paid dates this will normally be the leave type selected
     * by the employee.
     *
     * For unpaid overflow dates this will reference the configured
     * Loss of Pay / unpaid leave type.
     */
    allocatedLeaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      default: null,
    },

    allocatedLeaveTypeName: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        100,
        "Allocated leave type name cannot exceed 100 characters.",
      ],
    },

    allocatedLeaveTypeCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      maxlength: [30, "Allocated leave type code cannot exceed 30 characters."],
    },

    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const leaveStatusHistorySchema = new mongoose.Schema(
  {
    fromStatus: {
      type: String,
      enum: [...LEAVE_REQUEST_STATUSES, null],
      default: null,
    },

    toStatus: {
      type: String,
      enum: LEAVE_REQUEST_STATUSES,
      required: [true, "New leave request status is required."],
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Status change actor is required."],
    },

    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Status history note cannot exceed 2000 characters."],
    },

    changedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    _id: true,
    versionKey: false,
  },
);

const leaveBalanceAllocationSchema = new mongoose.Schema(
  {
    /**
     * Used mainly by MONTHLY_ACCRUAL balances.
     *
     * Example:
     * 2026-09
     * 2026-10
     *
     * null means the request consumed from the general
     * annual/manual balance rather than a monthly bucket.
     */
    periodKey: {
      type: String,
      default: null,
      match: [
        /^\d{4}-(0[1-9]|1[0-2])$/,
        "Balance allocation period key must use YYYY-MM format.",
      ],
    },

    days: {
      type: Number,
      required: [true, "Allocated leave days are required."],
      min: [0.5, "Allocated leave days must be at least 0.5."],
      validate: {
        validator(value) {
          return (
            Number.isFinite(Number(value)) &&
            Number(value) > 0 &&
            Number.isInteger(Number(value) * 2)
          );
        },
        message:
          "Allocated leave days must use positive whole-day or half-day increments.",
      },
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const leaveRequestSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: [true, "Employee is required."],
      index: true,
    },

    companyAccessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Company access is required."],
      index: true,
    },

    /**
     * Organizational snapshots preserve the employee's scope
     * at the time the request was submitted.
     */
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },

    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
      index: true,
    },

    leaveTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveType",
      required: [true, "Leave type is required."],
      index: true,
    },

    leavePolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeavePolicy",
      required: [true, "Leave policy is required."],
      index: true,
    },

    leaveBalanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveBalance",
      default: null,
      index: true,
    },

    balanceAllocations: {
      type: [leaveBalanceAllocationSchema],
      default: [],
    },

    /**
     * Snapshots protect historical meaning if the LeaveType is
     * renamed or reconfigured later.
     */
    leaveTypeName: {
      type: String,
      required: [true, "Leave type name snapshot is required."],
      trim: true,
      maxlength: [100, "Leave type name cannot exceed 100 characters."],
    },

    leaveTypeCode: {
      type: String,
      required: [true, "Leave type code snapshot is required."],
      trim: true,
      uppercase: true,
      maxlength: [30, "Leave type code cannot exceed 30 characters."],
    },

    paymentType: {
      type: String,
      enum: ["PAID", "UNPAID"],
      required: [true, "Leave payment type is required."],
      index: true,
    },

    fromDate: {
      type: Date,
      required: [true, "Leave start date is required."],
      index: true,
    },

    toDate: {
      type: Date,
      required: [true, "Leave end date is required."],
      index: true,
    },

    /**
     * Requested portion for the first and final dates.
     *
     * Multi-day requests will normally use FULL_DAY for both.
     * Half-day requests must use the same fromDate and toDate.
     */
    startDayPortion: {
      type: String,
      enum: ["FULL_DAY", "FIRST_HALF", "SECOND_HALF"],
      default: "FULL_DAY",
    },

    endDayPortion: {
      type: String,
      enum: ["FULL_DAY", "FIRST_HALF", "SECOND_HALF"],
      default: "FULL_DAY",
    },

    dateDetails: {
      type: [leaveDateDetailSchema],
      required: true,
      default: [],
    },

    requestedDays: {
      type: Number,
      required: [true, "Requested leave days are required."],
      min: [0.5, "A leave request must contain at least 0.5 leave days."],
      max: [366, "A leave request cannot exceed 366 leave days."],
      validate: halfDayIncrementValidator,
    },

    /**
     * Number of requested leave days covered by the selected
     * paid leave entitlement.
     *
     * For a fully unpaid request this will be 0.
     */
    paidDays: {
      type: Number,
      default: 0,
      min: [0, "Paid leave days cannot be negative."],
      validate: halfDayIncrementValidator,
    },

    /**
     * Number of requested leave days treated as unpaid / Loss of Pay.
     *
     * A request may therefore contain both paidDays and unpaidDays
     * while still remaining a single leave request.
     */
    unpaidDays: {
      type: Number,
      default: 0,
      min: [0, "Unpaid leave days cannot be negative."],
      validate: halfDayIncrementValidator,
    },

    reason: {
      type: String,
      required: [true, "Leave reason is required."],
      trim: true,
      minlength: [3, "Leave reason must contain at least 3 characters."],
      maxlength: [3000, "Leave reason cannot exceed 3000 characters."],
    },

    attachmentUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Attachment URL cannot exceed 2000 characters."],
    },

    status: {
      type: String,
      enum: LEAVE_REQUEST_STATUSES,
      default: "PENDING",
      index: true,
    },

    /**
     * ========================================================
     * RECOMMENDATION
     * ========================================================
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
      maxlength: [2000, "Recommendation note cannot exceed 2000 characters."],
    },

    /**
     * ========================================================
     * APPROVAL
     * ========================================================
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
      maxlength: [2000, "Approval note cannot exceed 2000 characters."],
    },

    /**
     * ========================================================
     * REJECTION
     * ========================================================
     */

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
      maxlength: [2000, "Rejection reason cannot exceed 2000 characters."],
    },

    /**
     * ========================================================
     * CANCELLATION
     * ========================================================
     */

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
      maxlength: [2000, "Cancellation reason cannot exceed 2000 characters."],
    },

    /**
     * Approved leave may require a separate cancellation request
     * because balance and attendance have already been affected.
     */
    cancellationStatus: {
      type: String,
      enum: ["NOT_REQUESTED", "PENDING", "APPROVED", "REJECTED"],
      default: "NOT_REQUESTED",
      index: true,
    },

    cancellationRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationRequestedAt: {
      type: Date,
      default: null,
    },

    cancellationRequestReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        2000,
        "Cancellation request reason cannot exceed 2000 characters.",
      ],
    },

    cancellationReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReviewedAt: {
      type: Date,
      default: null,
    },

    cancellationReviewNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        2000,
        "Cancellation review note cannot exceed 2000 characters.",
      ],
    },

    /**
     * ========================================================
     * BALANCE APPLICATION
     * ========================================================
     */

    balanceStatus: {
      type: String,
      enum: [
        "NOT_REQUIRED",
        "PENDING_RESERVATION",
        "RESERVED",
        "CONSUMED",
        "RELEASED",
        "FAILED",
      ],
      default: "NOT_REQUIRED",
      index: true,
    },

    balanceError: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Balance error cannot exceed 2000 characters."],
    },

    /**
     * ========================================================
     * ATTENDANCE APPLICATION
     * ========================================================
     */

    attendanceApplicationStatus: {
      type: String,
      enum: ["NOT_APPLIED", "APPLIED", "FAILED", "REVERSED"],
      default: "NOT_APPLIED",
      index: true,
    },

    attendanceAppliedAt: {
      type: Date,
      default: null,
    },

    attendanceAppliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    attendanceApplicationError: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        2000,
        "Attendance application error cannot exceed 2000 characters.",
      ],
    },

    /**
     * Unpaid leave may later be consumed by payroll.
     */
    payrollAdjustmentRequired: {
      type: Boolean,
      default: false,
      index: true,
    },

    statusHistory: {
      type: [leaveStatusHistorySchema],
      default: [],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Leave request creator is required."],
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
 * Main employee history query.
 */
leaveRequestSchema.index({
  companyId: 1,
  companyAccessId: 1,
  fromDate: -1,
  status: 1,
  isDeleted: 1,
});

/**
 * Manager/company request-list query.
 */
leaveRequestSchema.index({
  companyId: 1,
  departmentId: 1,
  teamId: 1,
  status: 1,
  fromDate: -1,
  isDeleted: 1,
});

/**
 * Overlap detection query.
 */
leaveRequestSchema.index({
  companyId: 1,
  companyAccessId: 1,
  fromDate: 1,
  toDate: 1,
  status: 1,
  isDeleted: 1,
});

leaveRequestSchema.pre("validate", function () {
  if (
    this.fromDate &&
    this.toDate &&
    new Date(this.toDate) < new Date(this.fromDate)
  ) {
    throw new Error("Leave end date cannot be before leave start date.");
  }

  const fromDateKey = this.fromDate
    ? new Date(this.fromDate).toISOString().slice(0, 10)
    : null;

  const toDateKey = this.toDate
    ? new Date(this.toDate).toISOString().slice(0, 10)
    : null;

  const isSingleDayRequest =
    fromDateKey && toDateKey && fromDateKey === toDateKey;

  if (
    !isSingleDayRequest &&
    (this.startDayPortion !== "FULL_DAY" || this.endDayPortion !== "FULL_DAY")
  ) {
    throw new Error(
      "Half-day leave is currently supported only for single-day requests.",
    );
  }

  if (isSingleDayRequest && this.startDayPortion !== this.endDayPortion) {
    throw new Error(
      "Start and end day portions must match for a single-day leave request.",
    );
  }

  const dateKeys = this.dateDetails.map((detail) =>
    new Date(detail.date).toISOString().slice(0, 10),
  );

  if (new Set(dateKeys).size !== dateKeys.length) {
    throw new Error(
      "Leave request date details cannot contain duplicate dates.",
    );
  }

  const calculatedRequestedDays = this.dateDetails.reduce(
    (total, detail) => total + Number(detail.leaveDays || 0),
    0,
  );

  if (
    this.dateDetails.length > 0 &&
    Math.abs(calculatedRequestedDays - Number(this.requestedDays)) > 0.001
  ) {
    throw new Error(
      "Requested leave days must match the calculated date details.",
    );
  }

  const totalAllocatedDays = Number(
    (Number(this.paidDays || 0) + Number(this.unpaidDays || 0)).toFixed(2),
  );

  if (
    Number(this.requestedDays || 0) > 0 &&
    Math.abs(totalAllocatedDays - Number(this.requestedDays)) > 0.001
  ) {
    throw new Error(
      "Paid and unpaid leave days must equal the total requested leave days.",
    );
  }

  this.payrollAdjustmentRequired = Number(this.unpaidDays || 0) > 0;

  if (this.status === "RECOMMENDED" && !this.recommendedAt) {
    throw new Error(
      "Recommended leave requests must contain recommendation details.",
    );
  }

  if (this.status === "APPROVED" && !this.approvedAt) {
    throw new Error("Approved leave requests must contain approval details.");
  }

  if (this.status === "REJECTED" && !this.rejectedAt) {
    throw new Error("Rejected leave requests must contain rejection details.");
  }

  if (this.status === "CANCELLED" && !this.cancelledAt) {
    throw new Error(
      "Cancelled leave requests must contain cancellation details.",
    );
  }
});

const LeaveRequest = mongoose.model("LeaveRequest", leaveRequestSchema);

export default LeaveRequest;
