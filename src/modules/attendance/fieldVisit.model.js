import mongoose from "mongoose";

/**
 * ============================================================
 * LOCATION EVIDENCE
 * ============================================================
 *
 * GPS evidence captured when starting/ending a field visit.
 */
const fieldVisitLocationSchema = new mongoose.Schema(
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

    /**
     * Optional known AttendanceLocation.
     *
     * For example:
     * - permanent client site
     * - project site
     *
     * Ad-hoc field visits may leave this null.
     */
    attendanceLocationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceLocation",
      default: null,
    },

    /**
     * Backend-calculated distance if a known
     * AttendanceLocation was involved.
     */
    distanceFromLocationMeters: {
      type: Number,
      default: null,
      min: 0,
    },

    withinGeofence: {
      type: Boolean,
      default: null,
    },

    addressText: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
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
 * ============================================================
 * FIELD VISIT
 * ============================================================
 *
 * Represents an employee leaving/working outside the normal
 * office location for business purposes.
 *
 * Examples:
 *
 * - Client meeting
 * - Sales visit
 * - Project-site inspection
 * - Vendor meeting
 * - Collection/delivery visit
 * - Business development visit
 */
const fieldVisitSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
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

    /**
     * Link the visit to that day's attendance where available.
     */
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
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
     * VISIT TYPE
     * ========================================================
     */

    visitType: {
      type: String,
      enum: [
        "CLIENT_VISIT",
        "PROJECT_SITE",
        "SALES_VISIT",
        "VENDOR_VISIT",
        "DELIVERY",
        "COLLECTION",
        "OFFICIAL_ERRAND",
        "OTHER",
      ],
      default: "CLIENT_VISIT",
      index: true,
    },

    /**
     * Existing Client reference.
     *
     * Optional because not every field visit necessarily
     * belongs to a registered client.
     */
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },

    /**
     * Human-readable location/site name.
     *
     * Example:
     *
     * "ABC Industries - Whitefield Plant"
     */
    siteName: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },

    purpose: {
      type: String,
      required: [true, "Field visit purpose is required."],
      trim: true,
      maxlength: [1500, "Field visit purpose cannot exceed 1500 characters."],
    },

    /**
     * ========================================================
     * START
     * ========================================================
     */

    startedAt: {
      type: Date,
      required: [true, "Field visit start time is required."],
      index: true,
    },

    startLocation: {
      type: fieldVisitLocationSchema,
      required: [true, "Field visit start location is required."],
    },

    /**
     * ========================================================
     * END
     * ========================================================
     */

    endedAt: {
      type: Date,
      default: null,
    },

    endLocation: {
      type: fieldVisitLocationSchema,
      default: null,
    },

    /**
     * Backend-calculated duration.
     */
    durationMinutes: {
      type: Number,
      default: 0,
      min: [0, "Field visit duration cannot be negative."],
    },

    outcome: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Field visit outcome cannot exceed 2000 characters."],
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    /**
     * ========================================================
     * STATUS
     * ========================================================
     */

    status: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "IN_PROGRESS",
      index: true,
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
 * Employee's field-visit history.
 */
fieldVisitSchema.index({
  companyId: 1,
  companyAccessId: 1,
  attendanceDate: -1,
  isDeleted: 1,
});

/**
 * Company daily field visits.
 */
fieldVisitSchema.index({
  companyId: 1,
  attendanceDate: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Client visit reporting.
 */
fieldVisitSchema.index({
  companyId: 1,
  clientId: 1,
  attendanceDate: -1,
  isDeleted: 1,
});

/**
 * Attendance-linked field visits.
 */
fieldVisitSchema.index({
  companyId: 1,
  attendanceId: 1,
  isDeleted: 1,
});

/**
 * Useful for finding currently active visits.
 */
fieldVisitSchema.index({
  companyId: 1,
  companyAccessId: 1,
  status: 1,
  isDeleted: 1,
});

fieldVisitSchema.index(
  {
    companyId: 1,
    companyAccessId: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "IN_PROGRESS",
      isDeleted: false,
    },
  },
);

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

fieldVisitSchema.pre("validate", function () {
  /**
   * COMPLETED visit requires end timestamp + end location.
   */
  if (this.status === "COMPLETED" && (!this.endedAt || !this.endLocation)) {
    throw new Error(
      "Completed field visit must contain end time and end location.",
    );
  }

  /**
   * End time cannot precede start time.
   */
  if (
    this.startedAt &&
    this.endedAt &&
    new Date(this.endedAt) < new Date(this.startedAt)
  ) {
    throw new Error("Field visit end time cannot be earlier than start time.");
  }

  /**
   * CANCELLED visit must preserve cancellation evidence.
   */
  if (this.status === "CANCELLED" && (!this.cancelledBy || !this.cancelledAt)) {
    throw new Error(
      "Cancelled field visit must contain cancelled-by and cancellation time.",
    );
  }
});

const FieldVisit = mongoose.model("FieldVisit", fieldVisitSchema);

export default FieldVisit;
