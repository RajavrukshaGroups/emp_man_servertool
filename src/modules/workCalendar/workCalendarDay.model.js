import mongoose from "mongoose";

/**
 * ============================================================
 * WORK CALENDAR DAY
 * ============================================================
 *
 * Stores date-specific calendar exceptions/events.
 *
 * Recurring weekly offs belong to WorkCalendar.weeklyOffDays.
 *
 * Examples:
 *
 * 2026-10-20 -> FESTIVAL_HOLIDAY -> Diwali
 * 2026-10-02 -> PUBLIC_HOLIDAY   -> Gandhi Jayanti
 * 2026-10-25 -> WORKING_DAY_OVERRIDE
 *
 * IMPORTANT:
 *
 * A WorkCalendarDay overrides the normal recurring weekly rule
 * for that particular date.
 */

const workCalendarDaySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    /**
     * Calendar configuration under which this dated entry exists.
     */
    workCalendarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkCalendar",
      required: [true, "Work calendar is required."],
      index: true,
    },

    /**
     * Logical company-local calendar date.
     *
     * Keep this as YYYY-MM-DD, consistent with Attendance's
     * logical attendanceDate approach.
     */
    date: {
      type: String,
      required: [true, "Calendar date is required."],
      match: [
        /^\d{4}-\d{2}-\d{2}$/,
        "Calendar date must use YYYY-MM-DD format.",
      ],
      index: true,
    },

    /**
     * ========================================================
     * DAY TYPE
     * ========================================================
     *
     * Holiday types make the date non-working.
     *
     * WORKING_DAY_OVERRIDE makes a normally non-working date
     * (for example Sunday) a working day.
     */
    type: {
      type: String,
      enum: [
        "PUBLIC_HOLIDAY",
        "COMPANY_HOLIDAY",
        "FESTIVAL_HOLIDAY",
        "SPECIAL_HOLIDAY",
        "WORKING_DAY_OVERRIDE",
      ],
      required: [true, "Calendar day type is required."],
      index: true,
    },

    /**
     * Human-readable event/holiday name.
     *
     * Examples:
     * Diwali
     * Gandhi Jayanti
     * Annual Company Holiday
     * Special Working Saturday
     */
    name: {
      type: String,
      required: [true, "Calendar day name is required."],
      trim: true,
      maxlength: [150, "Calendar day name cannot exceed 150 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        1000,
        "Calendar day description cannot exceed 1000 characters.",
      ],
    },

    /**
     * Explicitly stored for easier downstream interpretation.
     *
     * Holiday types => false
     * WORKING_DAY_OVERRIDE => true
     *
     * The pre-validation hook below keeps this synchronized
     * with `type`.
     */
    isWorkingDay: {
      type: Boolean,
      required: true,
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
 * Only one active/non-deleted calendar-day definition should
 * exist for a particular calendar and logical date.
 *
 * Example:
 *
 * 2026-10-25 cannot simultaneously be:
 *
 * FESTIVAL_HOLIDAY
 * and
 * WORKING_DAY_OVERRIDE
 *
 * inside the same WorkCalendar.
 */
workCalendarDaySchema.index(
  {
    companyId: 1,
    workCalendarId: 1,
    date: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * Efficient company calendar/date-range queries.
 */
workCalendarDaySchema.index({
  companyId: 1,
  date: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Efficient listing of entries belonging to one calendar.
 */
workCalendarDaySchema.index({
  companyId: 1,
  workCalendarId: 1,
  status: 1,
  date: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

workCalendarDaySchema.pre("validate", function () {
  /**
   * isWorkingDay must be derived by the backend/model,
   * not trusted from frontend input.
   */
  if (this.type === "WORKING_DAY_OVERRIDE") {
    this.isWorkingDay = true;
  } else if (
    [
      "PUBLIC_HOLIDAY",
      "COMPANY_HOLIDAY",
      "FESTIVAL_HOLIDAY",
      "SPECIAL_HOLIDAY",
    ].includes(this.type)
  ) {
    this.isWorkingDay = false;
  }
});

const WorkCalendarDay = mongoose.model(
  "WorkCalendarDay",
  workCalendarDaySchema,
);

export default WorkCalendarDay;
 