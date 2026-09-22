import mongoose from "mongoose";

const halfDayIncrementValidator = {
  validator(value) {
    return Number.isInteger(Number(value) * 2);
  },
  message: "Leave days must use whole-day or half-day increments.",
};

const leaveTypeSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Leave type name is required."],
      trim: true,
      minlength: [2, "Leave type name must contain at least 2 characters."],
      maxlength: [100, "Leave type name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Leave type code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Leave type code must contain at least 2 characters."],
      maxlength: [30, "Leave type code cannot exceed 30 characters."],
      match: [
        /^[A-Z][A-Z0-9_]*$/,
        "Leave type code may contain only letters, numbers and underscores.",
      ],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        1000,
        "Leave type description cannot exceed 1000 characters.",
      ],
    },

    /**
     * PAID:
     * Leave days are normally deducted from an allocated balance.
     *
     * UNPAID:
     * Leave may be approved without a paid balance.
     */
    paymentType: {
      type: String,
      enum: ["PAID", "UNPAID"],
      default: "PAID",
      index: true,
    },

    /**
     * Some leave types may not use balances.
     *
     * Example:
     * - Loss of Pay: false
     * - Casual Leave: true
     */
    requiresBalance: {
      type: Boolean,
      default: true,
    },

    /**
     * Default yearly allocation used when creating an employee's
     * LeaveBalance for this leave type and year.
     */
    annualEntitlementDays: {
      type: Number,
      default: 0,
      min: [0, "Annual entitlement cannot be negative."],
      max: [366, "Annual entitlement cannot exceed 366 days."],
      validate: halfDayIncrementValidator,
    },

    allocationMethod: {
      type: String,
      enum: ["ANNUAL_UPFRONT", "MONTHLY_ACCRUAL", "MANUAL", "NO_BALANCE"],
      default: "ANNUAL_UPFRONT",
      index: true,
    },

    monthlyEntitlementDays: {
      type: Number,
      default: 0,
      min: [0, "Monthly entitlement cannot be negative."],
      max: [31, "Monthly entitlement cannot exceed 31 days."],
      validate: halfDayIncrementValidator,
    },

    maximumMonthlyUsageDays: {
      type: Number,
      default: null,
      min: [0.5, "Maximum monthly usage must be at least 0.5 days."],
      max: [31, "Maximum monthly usage cannot exceed 31 days."],
      validate: {
        validator(value) {
          return value === null || Number.isInteger(Number(value) * 2);
        },
        message:
          "Maximum monthly usage must use whole-day or half-day increments.",
      },
    },

    allowMonthlyAccumulation: {
      type: Boolean,
      default: true,
    },

    allowHalfDay: {
      type: Boolean,
      default: true,
    },

    /**
     * Number of completed employment days required before this
     * leave type becomes available.
     */
    minimumServiceDays: {
      type: Number,
      default: 0,
      min: [0, "Minimum service days cannot be negative."],
      max: [3650, "Minimum service days cannot exceed 3650 days."],
      validate: {
        validator: Number.isInteger,
        message: "Minimum service days must be a whole number.",
      },
    },

    /**
     * Minimum advance notice required for future leave.
     * Emergency/backdated handling will be validated separately.
     */
    minimumNoticeDays: {
      type: Number,
      default: 0,
      min: [0, "Minimum notice days cannot be negative."],
      max: [365, "Minimum notice days cannot exceed 365 days."],
      validate: {
        validator: Number.isInteger,
        message: "Minimum notice days must be a whole number.",
      },
    },

    maximumConsecutiveDays: {
      type: Number,
      default: null,
      min: [0.5, "Maximum consecutive days must be at least 0.5."],
      max: [366, "Maximum consecutive days cannot exceed 366 days."],
      validate: {
        validator(value) {
          return value === null || Number.isInteger(Number(value) * 2);
        },
        message:
          "Maximum consecutive days must use whole-day or half-day increments.",
      },
    },

    allowBackdatedApplication: {
      type: Boolean,
      default: false,
    },

    maximumBackdatedDays: {
      type: Number,
      default: 0,
      min: [0, "Maximum backdated days cannot be negative."],
      max: [365, "Maximum backdated days cannot exceed 365 days."],
      validate: {
        validator: Number.isInteger,
        message: "Maximum backdated days must be a whole number.",
      },
    },

    requireAttachment: {
      type: Boolean,
      default: false,
    },

    /**
     * Example:
     * Medical leave attachment becomes mandatory when the
     * request is for 3 or more days.
     */
    attachmentRequiredFromDays: {
      type: Number,
      default: null,
      min: [0.5, "Attachment threshold must be at least 0.5 days."],
      max: [366, "Attachment threshold cannot exceed 366 days."],
      validate: {
        validator(value) {
          return value === null || Number.isInteger(Number(value) * 2);
        },
        message:
          "Attachment threshold must use whole-day or half-day increments.",
      },
    },

    allowNegativeBalance: {
      type: Boolean,
      default: false,
    },

    carryForwardEnabled: {
      type: Boolean,
      default: false,
    },

    maximumCarryForwardDays: {
      type: Number,
      default: 0,
      min: [0, "Maximum carry-forward days cannot be negative."],
      max: [366, "Maximum carry-forward days cannot exceed 366 days."],
      validate: halfDayIncrementValidator,
    },

    effectiveFrom: {
      type: Date,
      required: [true, "Leave type effective-from date is required."],
      index: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
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
  },
);

/**
 * A non-deleted leave type code must be unique per company.
 */
leaveTypeSchema.index(
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

leaveTypeSchema.index({
  companyId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  isDeleted: 1,
});

leaveTypeSchema.pre("validate", function () {
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }

  /**
   * ==========================================================
   * NORMALIZE BALANCE CONFIGURATION
   * ==========================================================
   */

  if (
    this.requiresBalance === false ||
    this.allocationMethod === "NO_BALANCE"
  ) {
    this.requiresBalance = false;
    this.allocationMethod = "NO_BALANCE";
    this.annualEntitlementDays = 0;
    this.monthlyEntitlementDays = 0;
    this.allowMonthlyAccumulation = false;
    this.allowNegativeBalance = false;
  }

  if (this.allocationMethod === "ANNUAL_UPFRONT") {
    this.requiresBalance = true;
    this.monthlyEntitlementDays = 0;
    this.allowMonthlyAccumulation = false;

    if (this.annualEntitlementDays <= 0) {
      throw new Error(
        "Annual entitlement must be greater than 0 for annual-upfront leave.",
      );
    }
  }

  if (this.allocationMethod === "MONTHLY_ACCRUAL") {
    this.requiresBalance = true;
    this.annualEntitlementDays = 0;

    if (this.monthlyEntitlementDays <= 0) {
      throw new Error(
        "Monthly entitlement must be greater than 0 for monthly-accrual leave.",
      );
    }
  }

  if (this.allocationMethod === "MANUAL") {
    this.requiresBalance = true;
    this.annualEntitlementDays = 0;
    this.monthlyEntitlementDays = 0;
    this.allowMonthlyAccumulation = false;
  }

  /**
   * ==========================================================
   * EFFECTIVE DATES
   * ==========================================================
   */

  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    new Date(this.effectiveTo) < new Date(this.effectiveFrom)
  ) {
    throw new Error("Leave type effectiveTo cannot be before effectiveFrom.");
  }

  /**
   * ==========================================================
   * BACKDATED APPLICATION
   * ==========================================================
   */

  if (
    this.allowBackdatedApplication === false &&
    this.maximumBackdatedDays > 0
  ) {
    throw new Error(
      "Maximum backdated days must be 0 when backdated applications are disabled.",
    );
  }

  /**
   * ==========================================================
   * ATTACHMENT
   * ==========================================================
   */

  if (
    this.requireAttachment === true &&
    this.attachmentRequiredFromDays === null
  ) {
    this.attachmentRequiredFromDays = 0.5;
  }

  if (this.requireAttachment === false) {
    this.attachmentRequiredFromDays = null;
  }

  /**
   * ==========================================================
   * CARRY FORWARD
   * ==========================================================
   */

  if (this.carryForwardEnabled === false && this.maximumCarryForwardDays > 0) {
    throw new Error(
      "Maximum carry-forward days must be 0 when carry forward is disabled.",
    );
  }

  if (this.carryForwardEnabled === false) {
    this.maximumCarryForwardDays = 0;
  }
});

const LeaveType = mongoose.model("LeaveType", leaveTypeSchema);

export default LeaveType;
