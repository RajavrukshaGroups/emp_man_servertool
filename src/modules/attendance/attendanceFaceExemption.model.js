import mongoose from "mongoose";

const attendanceFaceExemptionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    companyAccessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: true,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "REVOKED"],
      default: "PENDING",
      index: true,
    },

    effectiveFrom: {
      type: Date,
      required: true,
    },

    effectiveTo: {
      type: Date,
      required: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revocationReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

attendanceFaceExemptionSchema.index({
  companyId: 1,
  companyAccessId: 1,
  status: 1,
  effectiveFrom: 1,
  effectiveTo: 1,
});

attendanceFaceExemptionSchema.pre("validate", function () {
  if (
    this.effectiveFrom &&
    this.effectiveTo &&
    this.effectiveTo <= this.effectiveFrom
  ) {
    this.invalidate(
      "effectiveTo",
      "Exemption end date must be after start date.",
    );
  }
});

const AttendanceFaceExemption = mongoose.model(
  "AttendanceFaceExemption",
  attendanceFaceExemptionSchema,
);

export default AttendanceFaceExemption;
