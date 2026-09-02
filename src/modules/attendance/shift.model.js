import mongoose from "mongoose";

const shiftSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Shift name is required."],
      trim: true,
      maxlength: [100, "Shift name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Shift code is required."],
      trim: true,
      uppercase: true,
      maxlength: [50, "Shift code cannot exceed 50 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Shift description cannot exceed 500 characters."],
    },

    /**
     * Shift start/end are stored as HH:mm strings.
     *
     * Example:
     * startTime: "09:30"
     * endTime: "18:30"
     *
     * Actual attendance timestamps are stored as Date values
     * inside Attendance.
     */
    startTime: {
      type: String,
      required: [true, "Shift start time is required."],
      trim: true,
      match: [
        /^(?:[01]\d|2[0-3]):[0-5]\d$/,
        "Shift start time must use HH:mm format.",
      ],
    },

    endTime: {
      type: String,
      required: [true, "Shift end time is required."],
      trim: true,
      match: [
        /^(?:[01]\d|2[0-3]):[0-5]\d$/,
        "Shift end time must use HH:mm format.",
      ],
    },

    /**
     * true for shifts crossing midnight.
     *
     * Example:
     * 22:00 -> 06:00
     */
    isOvernight: {
      type: Boolean,
      default: false,
    },

    /**
     * Minimum payable/working duration expected
     * for a full attendance day.
     *
     * Example:
     * 480 = 8 hours
     */
    fullDayMinutes: {
      type: Number,
      required: [true, "Full-day working minutes are required."],
      min: [1, "Full-day working minutes must be greater than 0."],
      max: [1440, "Full-day working minutes cannot exceed 1440 minutes."],
    },

    /**
     * Minimum duration required to qualify for half-day.
     *
     * Example:
     * 240 = 4 hours
     */
    halfDayMinutes: {
      type: Number,
      required: [true, "Half-day working minutes are required."],
      min: [1, "Half-day working minutes must be greater than 0."],
      max: [1440, "Half-day working minutes cannot exceed 1440 minutes."],
    },

    /**
     * Grace period after shift start before an employee
     * is considered late.
     */
    lateGraceMinutes: {
      type: Number,
      default: 0,
      min: [0, "Late grace minutes cannot be negative."],
      max: [720, "Late grace minutes cannot exceed 720 minutes."],
    },

    /**
     * Grace period before shift end during which
     * checkout is not considered early.
     */
    earlyCheckoutGraceMinutes: {
      type: Number,
      default: 0,
      min: [0, "Early checkout grace minutes cannot be negative."],
      max: [720, "Early checkout grace minutes cannot exceed 720 minutes."],
    },

    /**
     * Break configuration.
     *
     * These are shift defaults.
     * AttendancePolicy can later apply broader
     * company-level rules.
     */
    standardBreakMinutes: {
      type: Number,
      default: 0,
      min: [0, "Standard break minutes cannot be negative."],
      max: [720, "Standard break minutes cannot exceed 720 minutes."],
    },

    maxBreakMinutes: {
      type: Number,
      default: 0,
      min: [0, "Maximum break minutes cannot be negative."],
      max: [720, "Maximum break minutes cannot exceed 720 minutes."],
    },

    allowMultipleBreaks: {
      type: Boolean,
      default: true,
    },

    /**
     * Weekly working days for this shift.
     *
     * 0 = Sunday
     * 1 = Monday
     * ...
     * 6 = Saturday
     */
    workingDays: {
      type: [Number],
      default: [1, 2, 3, 4, 5, 6],

      validate: {
        validator: (days) => {
          if (!Array.isArray(days) || days.length === 0) {
            return false;
          }

          const uniqueDays = new Set(days);

          return (
            uniqueDays.size === days.length &&
            days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
          );
        },

        message:
          "Working days must contain unique weekday numbers between 0 and 6.",
      },
    },

    /**
     * Effective-dated shift configuration.
     *
     * Useful when companies modify shift rules later
     * without destroying historical payroll logic.
     */
    effectiveFrom: {
      type: Date,
      default: null,
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
 * ------------------------------------------------------------
 * INDEXES
 * ------------------------------------------------------------
 */

/**
 * Shift code must be unique inside a company.
 *
 * Soft-deleted shifts do not block code reuse.
 */
shiftSchema.index(
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

shiftSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

shiftSchema.index({
  companyId: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  isDeleted: 1,
});

/**
 * ------------------------------------------------------------
 * VALIDATION
 * ------------------------------------------------------------
 */

shiftSchema.pre("validate", function () {
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }

  if (
    this.halfDayMinutes != null &&
    this.fullDayMinutes != null &&
    this.halfDayMinutes > this.fullDayMinutes
  ) {
    throw new Error(
      "Half-day working minutes cannot exceed full-day working minutes.",
    );
  }

  if (
    this.standardBreakMinutes != null &&
    this.maxBreakMinutes != null &&
    this.maxBreakMinutes < this.standardBreakMinutes
  ) {
    throw new Error(
      "Maximum break minutes cannot be lower than standard break minutes.",
    );
  }

  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    new Date(this.effectiveTo) < new Date(this.effectiveFrom)
  ) {
    throw new Error(
      "Shift effective-to date cannot be earlier than effective-from date.",
    );
  }

  if (!this.isOvernight && this.startTime === this.endTime) {
    throw new Error("Shift start time and end time cannot be the same.");
  }
});

/**
 * ------------------------------------------------------------
 * HELPER VIRTUALS
 * ------------------------------------------------------------
 */

shiftSchema.virtual("workingHours").get(function () {
  if (!this.fullDayMinutes) {
    return 0;
  }

  return Number((this.fullDayMinutes / 60).toFixed(2));
});

shiftSchema.set("toJSON", {
  virtuals: true,
});

shiftSchema.set("toObject", {
  virtuals: true,
});

const Shift = mongoose.model("Shift", shiftSchema);

export default Shift;
