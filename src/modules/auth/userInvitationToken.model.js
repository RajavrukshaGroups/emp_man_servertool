import mongoose from "mongoose";

const userInvitationTokenSchema = new mongoose.Schema(
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

// Automatically remove expired invitation records.
userInvitationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Efficient lookup of a user's invitation history.
userInvitationTokenSchema.index({
  userId: 1,
  createdAt: -1,
});

// Only one unused invitation token per user.
userInvitationTokenSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { usedAt: null },
    name: "unique_unused_invitation_per_user",
  },
);

const UserInvitationToken = mongoose.model(
  "UserInvitationToken",
  userInvitationTokenSchema,
);

export default UserInvitationToken;
