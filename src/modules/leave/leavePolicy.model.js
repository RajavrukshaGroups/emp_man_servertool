import mongoose from "mongoose";

const leavePolicySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Leave policy name is required."],
      trim: true,
      minlength: [2, "Leave policy name must contain at least 2 characters."],
      maxlength: [100, "Leave policy name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Leave policy code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Leave policy code must contain at least 2 characters."],
      maxlength: [30, "Leave policy code cannot exceed 30 characters."],
      match: [
        /^[A-Z][A-Z0-9_]*$/,
        "Leave policy code may contain only letters, numbers and underscores.",
      ],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        1000,
        "Leave policy description cannot exceed 1000 characters.",
      ],
    },

    /**
     * ========================================================
     * LEAVE YEAR
     * ========================================================
     *
     * Examples:
     *
     * Calendar year:
     * startMonth = 1
     * startDay = 1
     *
     * Indian financial year:
     * startMonth = 4
     * startDay = 1
     */
    leaveYearStartMonth: {
      type: Number,
      required: true,
      default: 1,
      min: [1, "Leave year start month must be between 1 and 12."],
      max: [12, "Leave year start month must be between 1 and 12."],
      validate: {
        validator: Number.isInteger,
        message: "Leave year start month must be a whole number.",
      },
    },

    /**
     * Limited to 28 so the date is valid for every month.
     */
    leaveYearStartDay: {
      type: Number,
      required: true,
      default: 1,
      min: [1, "Leave year start day must be between 1 and 28."],
      max: [28, "Leave year start day must be between 1 and 28."],
      validate: {
        validator: Number.isInteger,
        message: "Leave year start day must be a whole number.",
      },
    },

    /**
     * ========================================================
     * LEAVE-DAY CALCULATION
     * ========================================================
     */

    /**
     * Weekly offs are resolved from the employee's assigned shift.
     */
    excludeWeeklyOffsFromLeaveDays: {
      type: Boolean,
      default: true,
    },

    /**
     * This becomes fully effective after the Holiday module
     * provides company holiday dates.
     */
    excludePublicHolidaysFromLeaveDays: {
      type: Boolean,
      default: true,
    },

    /**
     * NONE:
     * Weekly offs and holidays follow their normal exclusion rules.
     *
     * COUNT_INTERVENING_NON_WORKING_DAYS:
     * Non-working days between leave dates are counted as leave.
     *
     * Example:
     * Friday leave + Monday leave may count Saturday and Sunday.
     */
    sandwichRule: {
      type: String,
      enum: ["NONE", "COUNT_INTERVENING_NON_WORKING_DAYS"],
      default: "NONE",
    },

    /**
     * ========================================================
     * APPROVAL WORKFLOW
     * ========================================================
     */

    /**
     * DIRECT_APPROVAL:
     * An authorized approver may approve a PENDING request.
     *
     * RECOMMEND_THEN_APPROVE:
     * Team Lead/manager recommends first, then HR/Admin approves.
     */
    approvalWorkflow: {
      type: String,
      enum: ["DIRECT_APPROVAL", "RECOMMEND_THEN_APPROVE"],
      default: "RECOMMEND_THEN_APPROVE",
      index: true,
    },

    /**
     * Allows an authorized company-level approver to approve a
     * pending request directly during exceptional situations.
     */
    allowApprovalWithoutRecommendation: {
      type: Boolean,
      default: true,
    },

    /**
     * ========================================================
     * REQUEST RESTRICTIONS
     * ========================================================
     */

    preventOverlappingRequests: {
      type: Boolean,
      default: true,
    },

    /**
     * Reject leave for dates containing attendance activity.
     * The service will check work sessions before approval.
     */
    preventAttendanceConflict: {
      type: Boolean,
      default: true,
    },

    /**
     * Optional company-wide limit for applications too far
     * into the future.
     *
     * null means no company-wide future limit.
     */
    maximumFutureApplicationDays: {
      type: Number,
      default: null,
      min: [0, "Maximum future application days cannot be negative."],
      max: [1095, "Maximum future application days cannot exceed 1095 days."],
      validate: {
        validator(value) {
          return value === null || Number.isInteger(value);
        },
        message: "Maximum future application days must be a whole number.",
      },
    },

    requireReason: {
      type: Boolean,
      default: true,
    },

    /**
     * ========================================================
     * BALANCE MANAGEMENT
     * ========================================================
     */

    /**
     * Automatically create the employee/year/type balance when
     * it does not exist.
     */
    autoCreateLeaveBalances: {
      type: Boolean,
      default: true,
    },

    /**
     * Reserve requested days while a request is PENDING or
     * RECOMMENDED to prevent multiple requests consuming the
     * same available balance.
     */
    reserveBalanceOnSubmission: {
      type: Boolean,
      default: true,
    },

    /**
     * Reduce annual entitlement proportionally for employees
     * who join partway through the leave year.
     */
    prorateEntitlementForNewJoiners: {
      type: Boolean,
      default: true,
    },

    prorationRounding: {
      type: String,
      enum: ["DOWN_TO_HALF", "NEAREST_HALF", "UP_TO_HALF"],
      default: "NEAREST_HALF",
    },

    /**
     * ========================================================
     * EMPLOYEE CANCELLATION
     * ========================================================
     */

    allowEmployeeCancelPending: {
      type: Boolean,
      default: true,
    },

    allowEmployeeCancelRecommended: {
      type: Boolean,
      default: true,
    },

    /**
     * Approved leave cancellation should normally be controlled
     * because balances and attendance may already be affected.
     */
    allowApprovedLeaveCancellation: {
      type: Boolean,
      default: false,
    },

    /**
     * If approved-leave cancellation is enabled, an authorized
     * approver must approve the cancellation before restoring
     * balance and attendance.
     */
    approvedCancellationRequiresApproval: {
      type: Boolean,
      default: true,
    },

    /**
     * ========================================================
     * EFFECTIVE-DATED POLICY
     * ========================================================
     */

    effectiveFrom: {
      type: Date,
      required: [true, "Leave policy effective-from date is required."],
      index: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },

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
 * A non-deleted policy code is unique inside a company.
 */
leavePolicySchema.index(
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
 * Used when resolving the active/effective policy.
 */
leavePolicySchema.index({
  companyId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  isDeleted: 1,
});

/**
 * Used when resolving the company's default policy.
 *
 * The service layer will ensure that only one applicable
 * default policy exists for a company.
 */
leavePolicySchema.index({
  companyId: 1,
  isDefault: 1,
  status: 1,
  isDeleted: 1,
});

leavePolicySchema.pre("validate", function () {
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }

  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    new Date(this.effectiveTo) < new Date(this.effectiveFrom)
  ) {
    throw new Error("Leave policy effectiveTo cannot be before effectiveFrom.");
  }

  if (this.approvalWorkflow === "DIRECT_APPROVAL") {
    this.allowApprovalWithoutRecommendation = true;
  }

  if (this.allowApprovedLeaveCancellation === false) {
    this.approvedCancellationRequiresApproval = true;
  }
});

const LeavePolicy = mongoose.model("LeavePolicy", leavePolicySchema);

export default LeavePolicy;
