import mongoose from "mongoose";

/**
 * ============================================================
 * WORK CALENDAR
 * ============================================================
 *
 * Defines the company's normal recurring working-week pattern.
 *
 * Date-specific holidays and working-day overrides are stored
 * separately in WorkCalendarDay.
 *
 * Day numbering follows JavaScript Date#getDay():
 *
 * 0 = Sunday
 * 1 = Monday
 * 2 = Tuesday
 * 3 = Wednesday
 * 4 = Thursday
 * 5 = Friday
 * 6 = Saturday
 */

const workCalendarSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Work calendar name is required."],
      trim: true,
      maxlength: [100, "Work calendar name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Work calendar code is required."],
      trim: true,
      uppercase: true,
      maxlength: [50, "Work calendar code cannot exceed 50 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        500,
        "Work calendar description cannot exceed 500 characters.",
      ],
    },

    /**
     * ========================================================
     * RECURRING WEEKLY SCHEDULE
     * ========================================================
     *
     * Example:
     *
     * [0]    => Sunday off
     * [0, 6] => Saturday + Sunday off
     *
     * Do not create individual WorkCalendarDay records for
     * ordinary recurring weekly offs.
     */
    weeklyOffDays: {
      type: [
        {
          type: Number,
          min: 0,
          max: 6,
        },
      ],
      default: [0],
    },

    /**
     * ========================================================
     * EFFECTIVE DATING
     * ========================================================
     *
     * Calendar rules are versioned over time.
     *
     * If the company changes from:
     *
     * Sunday off
     *
     * to:
     *
     * Saturday + Sunday off
     *
     * historical attendance/leave meaning must not silently
     * change. The old calendar can be closed using effectiveTo
     * and a new calendar version can become applicable.
     */
    effectiveFrom: {
      type: Date,
      required: [true, "Calendar effective-from date is required."],
      index: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },

    /**
     * Normally one calendar will be the company's default
     * calendar for the applicable period.
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
 * Calendar code must be unique inside a company while the
 * calendar document is not soft deleted.
 */
workCalendarSchema.index(
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
 * Resolve the calendar applicable for a company/date.
 */
workCalendarSchema.index({
  companyId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  isDeleted: 1,
});

/**
 * Resolve company default calendar.
 */
workCalendarSchema.index({
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

workCalendarSchema.pre("validate", function () {
  /**
   * Normalize calendar code.
   */
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }

  /**
   * Prevent duplicate weekly-off values.
   *
   * Example:
   *
   * [0, 0, 6] -> [0, 6]
   */
  if (Array.isArray(this.weeklyOffDays)) {
    this.weeklyOffDays = [...new Set(this.weeklyOffDays)].sort((a, b) => a - b);
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
      "Work calendar effectiveTo cannot be before effectiveFrom.",
    );
  }
});

const WorkCalendar = mongoose.model("WorkCalendar", workCalendarSchema);

export default WorkCalendar;
