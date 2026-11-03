import mongoose from "mongoose";

const attendancePhotoEvidenceSchema = new mongoose.Schema(
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

    action: {
      type: String,
      enum: ["CHECK_IN", "CHECK_OUT", "FIELD_VISIT_START", "FIELD_VISIT_END"],
      required: true,
    },

    imagePublicId: {
      type: String,
      required: true,
      select: false,
    },

    imageAssetId: {
      type: String,
      required: true,
      select: false,
    },

    status: {
      type: String,
      enum: ["PENDING", "CONSUMED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },

    capturedAt: {
      type: Date,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    consumedAt: {
      type: Date,
      default: null,
    },

    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      default: null,
    },

    /**
     * Identifies the specific attendance work session.
     *
     * Important for companies allowing multiple
     * check-in/check-out sessions on the same day.
     */
    workSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    fieldVisitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FieldVisit",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

attendancePhotoEvidenceSchema.index({
  companyId: 1,
  companyAccessId: 1,
  action: 1,
  status: 1,
  expiresAt: 1,
});

const AttendancePhotoEvidence = mongoose.model(
  "AttendancePhotoEvidence",
  attendancePhotoEvidenceSchema,
);

export default AttendancePhotoEvidence;
