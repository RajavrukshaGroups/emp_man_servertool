import mongoose from "mongoose";

const clientAddressSchema = new mongoose.Schema(
  {
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
      default: "India",
      maxlength: [100, "Country cannot exceed 100 characters."],
    },

    postalCode: {
      type: String,
      trim: true,
      default: "",
      maxlength: [20, "Postal code cannot exceed 20 characters."],
    },
  },
  {
    _id: false,
    versionKey: false,
  },
);

const clientSchema = new mongoose.Schema(
  {
    /**
     * ==========================================================
     * TENANT / COMPANY
     * ==========================================================
     */

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    /**
     * ==========================================================
     * BASIC DETAILS
     * ==========================================================
     */

    name: {
      type: String,
      required: [true, "Client name is required."],
      trim: true,
      minlength: [2, "Client name must contain at least 2 characters."],
      maxlength: [150, "Client name cannot exceed 150 characters."],
    },

    /**
     * Human-friendly client code.
     *
     * Examples:
     *
     * MERCURY
     * MRCL
     * MYNRAL
     * DES
     */
    code: {
      type: String,
      required: [true, "Client code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Client code must contain at least 2 characters."],
      maxlength: [30, "Client code cannot exceed 30 characters."],
    },

    /**
     * Whether this client belongs to the same business/group
     * or is an external customer.
     *
     * Both types are treated as valid Client master records.
     */
    clientType: {
      type: String,
      enum: ["IN_HOUSE", "EXTERNAL"],
      required: [true, "Client type is required."],
      default: "EXTERNAL",
      index: true,
    },

    /**
     * Commercial / working relationship.
     *
     * Kept separate from clientType.
     *
     * Example:
     *
     * EXTERNAL + RETAINER
     * EXTERNAL + PROJECT
     * IN_HOUSE + ONGOING
     */
    engagementType: {
      type: String,
      enum: ["RETAINER", "PROJECT", "ONE_TIME", "ONGOING", "OTHER"],
      default: "PROJECT",
      index: true,
    },

    /**
     * ==========================================================
     * CONTACT DETAILS
     * ==========================================================
     */

    contactPerson: {
      type: String,
      trim: true,
      default: "",
      maxlength: [150, "Contact person cannot exceed 150 characters."],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      maxlength: [254, "Email cannot exceed 254 characters."],
    },

    mobile: {
      type: String,
      trim: true,
      default: "",
      maxlength: [30, "Mobile number cannot exceed 30 characters."],
    },

    alternateMobile: {
      type: String,
      trim: true,
      default: "",
      maxlength: [30, "Alternate mobile cannot exceed 30 characters."],
    },

    website: {
      type: String,
      trim: true,
      default: "",
      maxlength: [500, "Website URL cannot exceed 500 characters."],
    },

    /**
     * ==========================================================
     * ADDRESS
     * ==========================================================
     */

    address: {
      type: clientAddressSchema,
      default: () => ({}),
    },

    /**
     * ==========================================================
     * BUSINESS INFORMATION
     * ==========================================================
     */

    industry: {
      type: String,
      trim: true,
      default: "",
      maxlength: [150, "Industry cannot exceed 150 characters."],
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Client notes cannot exceed 3000 characters."],
    },

    /**
     * ==========================================================
     * STATUS
     * ==========================================================
     */

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },

    /**
     * ==========================================================
     * DATABASE AUDIT
     * ==========================================================
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
 * Client name must be unique inside a company.
 *
 * Different companies can have clients with the same name.
 */
clientSchema.index(
  {
    companyId: 1,
    name: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * Client code must be unique inside a company.
 */
clientSchema.index(
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
 * Main active client listing.
 */
clientSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Client type filtering.
 */
clientSchema.index({
  companyId: 1,
  clientType: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Engagement/reporting filtering.
 */
clientSchema.index({
  companyId: 1,
  engagementType: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Recent clients.
 */
clientSchema.index({
  companyId: 1,
  createdAt: -1,
});

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

clientSchema.pre("validate", function normalizeClient() {
  if (typeof this.name === "string") {
    this.name = this.name.replace(/\s+/g, " ").trim();
  }

  if (typeof this.code === "string") {
    this.code = this.code
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toUpperCase()
      .trim();
  }

  if (typeof this.contactPerson === "string") {
    this.contactPerson = this.contactPerson.replace(/\s+/g, " ").trim();
  }

  if (typeof this.email === "string") {
    this.email = this.email.toLowerCase().trim();
  }

  if (typeof this.industry === "string") {
    this.industry = this.industry.replace(/\s+/g, " ").trim();
  }
});

const Client = mongoose.model("Client", clientSchema);

export default Client;
