import mongoose from "mongoose";

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      select: false,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    usedAt: {
      type: Date,
      default: null,
    },

    createdByIp: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Automatically remove expired reset-token records.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

passwordResetTokenSchema.index({
  userId: 1,
  expiresAt: -1,
});

/**
 * Allow only one unused password reset token per user.
 * MongoDB enforces this even for simultaneous requests.
 */
passwordResetTokenSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { usedAt: null },
    name: "unique_unused_password_reset_per_user",
  },
);

const PasswordResetToken = mongoose.model(
  "PasswordResetToken",
  passwordResetTokenSchema,
);

export default PasswordResetToken;
