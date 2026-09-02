import mongoose from "mongoose";

/**
 * ============================================================
 * ATTENDANCE LOCATION
 * ============================================================
 *
 * Represents a physical location that can participate in
 * attendance/geofence validation.
 *
 * Examples:
 *
 * - Head Office
 * - Branch Office
 * - Warehouse
 * - Project Site
 * - Client Site
 *
 * IMPORTANT:
 *
 * The frontend only sends the employee's captured GPS
 * coordinates.
 *
 * The backend determines whether those coordinates fall
 * inside an allowed AttendanceLocation geofence.
 */

const attendanceLocationSchema = new mongoose.Schema(
  {
    /**
     * ========================================================
     * COMPANY
     * ========================================================
     */

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    /**
     * ========================================================
     * BASIC INFORMATION
     * ========================================================
     */

    name: {
      type: String,
      required: [true, "Attendance location name is required."],
      trim: true,
      maxlength: [
        150,
        "Attendance location name cannot exceed 150 characters.",
      ],
    },

    code: {
      type: String,
      required: [true, "Attendance location code is required."],
      trim: true,
      uppercase: true,
      maxlength: [50, "Attendance location code cannot exceed 50 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        500,
        "Attendance location description cannot exceed 500 characters.",
      ],
    },

    /**
     * Type is primarily useful for filtering, reporting and
     * frontend presentation.
     */
    locationType: {
      type: String,

      enum: [
        "OFFICE",
        "BRANCH",
        "WAREHOUSE",
        "PROJECT_SITE",
        "CLIENT_SITE",
        "OTHER",
      ],

      default: "OFFICE",

      index: true,
    },

    /**
     * ========================================================
     * OPTIONAL CLIENT ASSOCIATION
     * ========================================================
     *
     * A known client location can reference the Client module.
     *
     * Example:
     *
     * Client: ABC Industries
     * Location: ABC Industries - Bengaluru Plant
     *
     * This is optional because normal offices, branches and
     * warehouses do not belong to a client.
     */

    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },

    /**
     * ========================================================
     * ADDRESS
     * ========================================================
     *
     * Address is useful for humans/UI.
     *
     * GPS coordinates remain authoritative for geofence
     * calculations.
     */

    address: {
      addressLine1: {
        type: String,
        trim: true,
        default: "",
        maxlength: [200, "Address line 1 cannot exceed 200 characters."],
      },

      addressLine2: {
        type: String,
        trim: true,
        default: "",
        maxlength: [200, "Address line 2 cannot exceed 200 characters."],
      },

      city: {
        type: String,
        trim: true,
        default: "",
        maxlength: [100, "City cannot exceed 100 characters."],
      },

      district: {
        type: String,
        trim: true,
        default: "",
        maxlength: [100, "District cannot exceed 100 characters."],
      },

      state: {
        type: String,
        trim: true,
        default: "",
        maxlength: [100, "State cannot exceed 100 characters."],
      },

      country: {
        type: String,
        trim: true,
        default: "",
        maxlength: [100, "Country cannot exceed 100 characters."],
      },

      postalCode: {
        type: String,
        trim: true,
        default: "",
        maxlength: [20, "Postal code cannot exceed 20 characters."],
      },
    },

    /**
     * ========================================================
     * GEOLOCATION
     * ========================================================
     */

    latitude: {
      type: Number,
      required: [true, "Latitude is required."],
      min: [-90, "Latitude cannot be lower than -90."],
      max: [90, "Latitude cannot be greater than 90."],
    },

    longitude: {
      type: Number,
      required: [true, "Longitude is required."],
      min: [-180, "Longitude cannot be lower than -180."],
      max: [180, "Longitude cannot be greater than 180."],
    },

    /**
     * Radius around latitude/longitude inside which attendance
     * is considered to be within this location.
     *
     * Examples:
     *
     * Office       -> 100m
     * Warehouse    -> 300m
     * Project Site -> 500m
     *
     * This is intentionally location-specific.
     */
    geofenceRadiusMeters: {
      type: Number,
      required: [true, "Geofence radius is required."],
      min: [10, "Geofence radius must be at least 10 meters."],
      max: [10000, "Geofence radius cannot exceed 10000 meters."],
    },

    /**
     * ========================================================
     * ATTENDANCE USAGE
     * ========================================================
     */

    /**
     * Whether employees may use this location for normal
     * attendance check-in.
     */
    allowCheckIn: {
      type: Boolean,
      default: true,
    },

    /**
     * Whether employees may use this location for normal
     * attendance checkout.
     */
    allowCheckOut: {
      type: Boolean,
      default: true,
    },

    /**
     * Whether this location can be selected/used for
     * field/client visits.
     */
    allowFieldVisit: {
      type: Boolean,
      default: false,
    },

    /**
     * Default company attendance location.
     *
     * Example:
     * Head Office could be the default location.
     *
     * The service layer will enforce that only one active,
     * non-deleted default exists for a company.
     */
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    /**
     * ========================================================
     * EFFECTIVE DATES
     * ========================================================
     *
     * Allows a location to become valid/invalid from a
     * particular date without deleting historical information.
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

    /**
     * ========================================================
     * STATUS
     * ========================================================
     */

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
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

/**
 * Location code must be unique inside a company.
 *
 * A soft-deleted location does not prevent the company from
 * reusing that code later.
 */
attendanceLocationSchema.index(
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
 * Common location listing/filtering query.
 */
attendanceLocationSchema.index({
  companyId: 1,
  locationType: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Used while resolving usable attendance locations.
 */
attendanceLocationSchema.index({
  companyId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
  isDeleted: 1,
});

/**
 * Used while resolving the default location.
 */
attendanceLocationSchema.index({
  companyId: 1,
  isDefault: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Client-site lookup.
 */
attendanceLocationSchema.index({
  companyId: 1,
  clientId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

attendanceLocationSchema.pre("validate", function () {
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }

  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    new Date(this.effectiveTo) < new Date(this.effectiveFrom)
  ) {
    throw new Error(
      "Attendance location effective-to date cannot be earlier than effective-from date.",
    );
  }

  if (this.locationType === "CLIENT_SITE" && !this.clientId) {
    throw new Error(
      "Client is required when attendance location type is CLIENT_SITE.",
    );
  }

  if (this.locationType !== "CLIENT_SITE") {
    this.clientId = null;
  }
});

const AttendanceLocation = mongoose.model(
  "AttendanceLocation",
  attendanceLocationSchema,
);

export default AttendanceLocation;
