import mongoose from "mongoose";

const attendanceFaceEnrollmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
      immutable: true,
    },

    companyAccessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: true,
      index: true,
      immutable: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "REVOKED", "FAILED"],
      default: "PENDING",
      index: true,
    },

    provider: {
      type: String,
      trim: true,
      default: null,
    },

    providerEnrollmentId: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    imagePublicId: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    imageAssetId: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    enrolledAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    enrolledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    consentRecordedAt: {
      type: Date,
      default: null,
    },

    consentVersion: {
      type: String,
      trim: true,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    revocationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

attendanceFaceEnrollmentSchema.index(
  {
    companyId: 1,
    companyAccessId: 1,
  },
  {
    unique: true,
  },
);

attendanceFaceEnrollmentSchema.pre("validate", function () {
  if (this.status === "ACTIVE") {
    if (
      !this.provider ||
      !this.providerEnrollmentId ||
      !this.enrolledAt ||
      !this.consentRecordedAt ||
      !this.consentVersion
    ) {
      this.invalidate(
        "status",
        "Active enrollment requires provider details, enrollment date, and recorded consent.",
      );
    }
  }

  if (this.expiresAt && this.enrolledAt && this.expiresAt <= this.enrolledAt) {
    this.invalidate(
      "expiresAt",
      "Enrollment expiry must be after enrollment date.",
    );
  }
});

const AttendanceFaceEnrollment = mongoose.model(
  "AttendanceFaceEnrollment",
  attendanceFaceEnrollmentSchema,
);

export default AttendanceFaceEnrollment;
