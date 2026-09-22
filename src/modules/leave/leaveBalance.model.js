import mongoose from "mongoose";

const isHalfDayIncrement = (value) =>
  Number.isFinite(Number(value)) && Number.isInteger(Number(value) * 2);

const nonNegativeHalfDayValidator = {
  validator(value) {
    return Number(value) >= 0 && isHalfDayIncrement(value);
  },
  message:
    "Leave balance values must be non-negative whole-day or half-day increments.",
};

const signedHalfDayValidator = {
  validator(value) {
    return isHalfDayIncrement(value);
  },
  message: "Leave adjustment must use whole-day or half-day increments.",
};

/**
 * Monthly bucket for MONTHLY_ACCRUAL leave types.
 *
 * periodKey examples:
 * 2026-01
 * 2026-02
 */
const monthlyBalanceSchema = new mongoose.Schema(
  {
    periodKey: {
      type: String,
      required: [true, "Monthly balance period is required."],
      match: [
        /^\d{4}-(0[1-9]|1[0-2])$/,
        "Monthly balance period must use YYYY-MM format.",
      ],
    },

    creditedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    adjustedDays: {
      type: Number,
      default: 0,
      validate: signedHalfDayValidator,
    },

    pendingDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    usedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    lapsedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const balanceAdjustmentSchema = new mongoose.Schema(
  {
    adjustmentDays: {
      type: Number,
      required: [true, "Adjustment days are required."],
      validate: signedHalfDayValidator,
    },

    reason: {
      type: String,
      required: [true, "Balance adjustment reason is required."],
      trim: true,
      minlength: [3, "Adjustment reason must contain at least 3 characters."],
      maxlength: [
        1000,
        "Balance adjustment reason cannot exceed 1000 characters.",
      ],
    },

    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Balance adjustment actor is required."],
    },

    adjustedAt: {
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

const leaveBalanceSchema = new mongoose.Schema(
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

    /**
     * Effective leave-year boundaries.
     *
     * Calendar-year example:
     * 2026-01-01 through 2026-12-31
     *
     * Financial-year example:
     * 2026-04-01 through 2027-03-31
     */
    leaveYearStart: {
      type: Date,
      required: [true, "Leave year start is required."],
      index: true,
    },

    leaveYearEnd: {
      type: Date,
      required: [true, "Leave year end is required."],
      index: true,
    },

    leaveYearLabel: {
      type: String,
      required: [true, "Leave year label is required."],
      trim: true,
      maxlength: [20, "Leave year label cannot exceed 20 characters."],
    },

    /**
     * Snapshot the allocation method because LeaveType settings
     * may change in a later effective period.
     */
    allocationMethod: {
      type: String,
      enum: ["ANNUAL_UPFRONT", "MONTHLY_ACCRUAL", "MANUAL", "NO_BALANCE"],
      required: true,
      index: true,
    },

    /**
     * Days credited at the beginning of the leave year.
     */
    allocatedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    /**
     * Days credited periodically for monthly-accrual leave.
     */
    accruedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    /**
     * Balance brought from the previous leave year.
     */
    carriedForwardDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    /**
     * Signed total of administrative adjustments.
     *
     * Examples:
     * +1.0 manual credit
     * -0.5 correction
     */
    adjustedDays: {
      type: Number,
      default: 0,
      validate: signedHalfDayValidator,
    },

    /**
     * Reserved by PENDING and RECOMMENDED requests.
     */
    pendingDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    /**
     * Consumed by APPROVED requests.
     */
    usedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    /**
     * Expired monthly or yearly entitlement.
     */
    lapsedDays: {
      type: Number,
      default: 0,
      validate: nonNegativeHalfDayValidator,
    },

    monthlyBalances: {
      type: [monthlyBalanceSchema],
      default: [],
    },

    adjustmentHistory: {
      type: [balanceAdjustmentSchema],
      default: [],
    },

    lastAccruedPeriodKey: {
      type: String,
      default: null,
      match: [
        /^\d{4}-(0[1-9]|1[0-2])$/,
        "Last accrued period must use YYYY-MM format.",
      ],
    },

    status: {
      type: String,
      enum: ["ACTIVE", "CLOSED"],
      default: "ACTIVE",
      index: true,
    },

    closedAt: {
      type: Date,
      default: null,
    },

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

    toJSON: {
      virtuals: true,
    },

    toObject: {
      virtuals: true,
    },
  },
);

/**
 * Computed balance:
 *
 * credits + adjustments
 * minus pending, used and lapsed days.
 */
leaveBalanceSchema.virtual("availableDays").get(function () {
  const available =
    Number(this.allocatedDays || 0) +
    Number(this.accruedDays || 0) +
    Number(this.carriedForwardDays || 0) +
    Number(this.adjustedDays || 0) -
    Number(this.pendingDays || 0) -
    Number(this.usedDays || 0) -
    Number(this.lapsedDays || 0);

  return Number(available.toFixed(2));
});

/**
 * One balance per employee, leave type and leave year.
 */
leaveBalanceSchema.index(
  {
    companyId: 1,
    companyAccessId: 1,
    leaveTypeId: 1,
    leaveYearStart: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

leaveBalanceSchema.index({
  companyId: 1,
  employeeId: 1,
  status: 1,
  leaveYearStart: 1,
  isDeleted: 1,
});

leaveBalanceSchema.pre("validate", function () {
  if (
    this.leaveYearStart &&
    this.leaveYearEnd &&
    new Date(this.leaveYearEnd) < new Date(this.leaveYearStart)
  ) {
    throw new Error("Leave year end cannot be before the leave year start.");
  }

  const periodKeys = this.monthlyBalances.map(
    (monthlyBalance) => monthlyBalance.periodKey,
  );

  if (new Set(periodKeys).size !== periodKeys.length) {
    throw new Error(
      "Monthly balance periods must be unique inside a leave balance.",
    );
  }

  if (
    this.allocationMethod !== "MONTHLY_ACCRUAL" &&
    this.monthlyBalances.length > 0
  ) {
    throw new Error(
      "Monthly balances are allowed only for monthly-accrual leave.",
    );
  }

  if (
    this.allocationMethod !== "MONTHLY_ACCRUAL" &&
    this.lastAccruedPeriodKey !== null
  ) {
    throw new Error(
      "Last accrued period is allowed only for monthly-accrual leave.",
    );
  }

  if (this.status === "CLOSED" && !this.closedAt) {
    this.closedAt = new Date();
  }

  if (this.status === "ACTIVE") {
    this.closedAt = null;
  }
});

const LeaveBalance = mongoose.model("LeaveBalance", leaveBalanceSchema);

export default LeaveBalance;
