import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required."],
      index: true,
    },

    companyAccessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Company access is required."],
      index: true,
    },

    tokenHash: {
      type: String,
      required: [true, "Refresh token hash is required."],
      unique: true,
      index: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: [true, "Refresh token expiry is required."],
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    replacedByTokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefreshToken",
      default: null,
    },

    createdByIp: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    revokedByIp: {
      type: String,
      trim: true,
      default: "",
      maxlength: 100,
    },

    userAgent: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    revokeReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    isRevoked: {
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
 * Automatically remove expired refresh-token documents.
 *
 * MongoDB TTL cleanup is asynchronous and may not happen
 * exactly at the expiry second.
 */
refreshTokenSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

refreshTokenSchema.index({
  userId: 1,
  companyAccessId: 1,
  isRevoked: 1,
});

refreshTokenSchema.index({
  userId: 1,
  createdAt: -1,
});

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

export default RefreshToken;
