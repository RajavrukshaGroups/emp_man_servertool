import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required."],
      trim: true,
      minlength: [2, "First name must contain at least 2 characters."],
      maxlength: [50, "First name cannot exceed 50 characters."],
    },

    middleName: {
      type: String,
      trim: true,
      maxlength: [50, "Middle name cannot exceed 50 characters."],
      default: "",
    },

    lastName: {
      type: String,
      required: [true, "Last name is required."],
      trim: true,
      minlength: [1, "Last name is required."],
      maxlength: [50, "Last name cannot exceed 50 characters."],
    },

    displayName: {
      type: String,
      trim: true,
      maxlength: [120, "Display name cannot exceed 120 characters."],
      default: "",
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      trim: true,
      lowercase: true,
      maxlength: [150, "Email cannot exceed 150 characters."],
    },

    mobile: {
      type: String,
      trim: true,
      default: null,
      maxlength: [20, "Mobile number cannot exceed 20 characters."],
    },

    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [8, "Password must contain at least 8 characters."],
      select: false,
    },

    profilePhoto: {
      type: String,
      trim: true,
      default: "",
    },

    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"],
      default: "PREFER_NOT_TO_SAY",
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    mobileVerified: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    onboardingStatus: {
      type: String,
      enum: ["USER_CREATED", "COMPANY_ACCESS_CREATED", "COMPLETED"],
      default: "USER_CREATED",
      index: true,
    },

    onboardingCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },

    onboardingCompletedAt: {
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

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

userSchema.index(
  { mobile: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      mobile: { $type: "string" },
    },
  },
);

userSchema.index({
  firstName: 1,
  lastName: 1,
});

userSchema.index({
  createdAt: -1,
});

userSchema.index({
  onboardingCompanyId: 1,
  onboardingStatus: 1,
  isDeleted: 1,
  createdAt: -1,
});

userSchema.pre("validate", function setDisplayName() {
  if (!this.displayName) {
    this.displayName = [this.firstName, this.middleName, this.lastName]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
});

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword,
) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
