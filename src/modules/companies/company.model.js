import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    addressLine1: {
      type: String,
      trim: true,
      default: "",
    },

    addressLine2: {
      type: String,
      trim: true,
      default: "",
    },

    city: {
      type: String,
      trim: true,
      default: "",
    },

    state: {
      type: String,
      trim: true,
      default: "",
    },

    country: {
      type: String,
      trim: true,
      default: "India",
    },

    postalCode: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: false,
  },
);

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required."],
      trim: true,
      minlength: [2, "Company name must contain at least 2 characters."],
      maxlength: [150, "Company name cannot exceed 150 characters."],
    },

    legalName: {
      type: String,
      trim: true,
      maxlength: [200, "Legal name cannot exceed 200 characters."],
      default: "",
    },

    code: {
      type: String,
      required: [true, "Company code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Company code must contain at least 2 characters."],
      maxlength: [20, "Company code cannot exceed 20 characters."],
    },

    slug: {
      type: String,
      required: [true, "Company slug is required."],
      trim: true,
      lowercase: true,
    },

    logo: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    website: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: addressSchema,
      default: () => ({}),
    },

    timezone: {
      type: String,
      trim: true,
      default: "Asia/Kolkata",
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "INR",
    },

    dateFormat: {
      type: String,
      enum: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"],
      default: "DD/MM/YYYY",
    },

    timeFormat: {
      type: String,
      enum: ["12_HOUR", "24_HOUR"],
      default: "12_HOUR",
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

companySchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

companySchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

companySchema.index({ name: 1 });
companySchema.index({ status: 1, isDeleted: 1 });
companySchema.index({ createdAt: -1 });

const Company = mongoose.model("Company", companySchema);

export default Company;
