import mongoose from "mongoose";

const companyEmailSettingsSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      immutable: true,
    },

    provider: {
      type: String,
      enum: ["GOOGLE_WORKSPACE", "MICROSOFT_365", "CUSTOM_SMTP"],
      required: true,
      default: "GOOGLE_WORKSPACE",
    },

    smtpHost: {
      type: String,
      required: true,
      trim: true,
    },

    smtpPort: {
      type: Number,
      required: true,
      min: 1,
      max: 65535,
    },

    smtpSecure: {
      type: Boolean,
      default: true,
    },

    smtpUser: {
      type: String,
      required: true,
      trim: true,
    },

    // Store encrypted credentials only, never plaintext.
    smtpPasswordEncrypted: {
      type: String,
      required: true,
      select: false,
    },

    fromEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    fromName: {
      type: String,
      required: true,
      trim: true,
    },

    isEnabled: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    lastVerifiedAt: {
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
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/**
 * Exactly one email configuration per company.
 */
companyEmailSettingsSchema.index(
  { companyId: 1 },
  {
    unique: true,
    name: "unique_company_email_settings",
  },
);

const CompanyEmailSettings = mongoose.model(
  "CompanyEmailSettings",
  companyEmailSettingsSchema,
);

export default CompanyEmailSettings;
