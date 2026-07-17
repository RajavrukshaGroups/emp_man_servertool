import mongoose from "mongoose";

const companyAccessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required."],
      index: true,
    },

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: [true, "Role is required."],
      index: true,
    },

    employeeCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      maxlength: [50, "Employee code cannot exceed 50 characters."],
    },

    designation: {
      type: String,
      trim: true,
      default: "",
      maxlength: [100, "Designation cannot exceed 100 characters."],
    },

    employmentType: {
      type: String,
      enum: [
        "FULL_TIME",
        "PART_TIME",
        "CONTRACT",
        "INTERN",
        "CONSULTANT",
        "FREELANCER",
      ],
      default: "FULL_TIME",
      index: true,
    },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },

    /**
     * References another CompanyAccess record.
     *
     * This ensures the manager has access to the same company
     * and gives us access to their company-specific employment data.
     */
    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
      index: true,
    },

    joiningDate: {
      type: Date,
      default: null,
    },

    probationEndDate: {
      type: Date,
      default: null,
    },

    lastWorkingDate: {
      type: Date,
      default: null,
    },

    workLocationType: {
      type: String,
      enum: ["HEAD_OFFICE", "BRANCH", "REMOTE", "HYBRID", "CLIENT_LOCATION"],
      default: "HEAD_OFFICE",
      index: true,
    },

    workLocationName: {
      type: String,
      trim: true,
      default: "",
      maxlength: [150, "Work location name cannot exceed 150 characters."],
    },

    isPrimaryCompany: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: String,
      enum: ["ONBOARDING", "ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"],
      default: "ONBOARDING",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Notes cannot exceed 1000 characters."],
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

/**
 * A user can have only one active access record per company.
 */
companyAccessSchema.index(
  {
    companyId: 1,
    userId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * Employee code must be unique inside a company.
 *
 * The partial filter prevents null employee codes from conflicting.
 */
companyAccessSchema.index(
  {
    companyId: 1,
    employeeCode: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      employeeCode: {
        $type: "string",
      },
    },
  },
);

/**
 * A user can have only one primary company.
 */
companyAccessSchema.index(
  {
    userId: 1,
    isPrimaryCompany: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      isPrimaryCompany: true,
    },
  },
);

companyAccessSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

companyAccessSchema.index({
  companyId: 1,
  departmentId: 1,
  status: 1,
});

companyAccessSchema.index({
  companyId: 1,
  teamId: 1,
  status: 1,
});

companyAccessSchema.index({
  companyId: 1,
  roleId: 1,
  status: 1,
});

companyAccessSchema.index({
  createdAt: -1,
});

/**
 * Document-level consistency checks.
 *
 * Do not use `next` here because your current Mongoose version
 * treats this as synchronous/promise-based middleware.
 */
companyAccessSchema.pre("validate", function validateCompanyAccessDates() {
  if (
    this.probationEndDate &&
    this.joiningDate &&
    this.probationEndDate < this.joiningDate
  ) {
    this.invalidate(
      "probationEndDate",
      "Probation end date cannot be earlier than joining date.",
    );
  }

  if (
    this.lastWorkingDate &&
    this.joiningDate &&
    this.lastWorkingDate < this.joiningDate
  ) {
    this.invalidate(
      "lastWorkingDate",
      "Last working date cannot be earlier than joining date.",
    );
  }

  if (
    ["RESIGNED", "TERMINATED"].includes(this.status) &&
    !this.lastWorkingDate
  ) {
    this.invalidate(
      "lastWorkingDate",
      `Last working date is required when status is ${this.status}.`,
    );
  }

  if (
    !["RESIGNED", "TERMINATED"].includes(this.status) &&
    this.lastWorkingDate
  ) {
    this.invalidate(
      "lastWorkingDate",
      "Last working date can only be set for resigned or terminated access.",
    );
  }

  if (
    this.reportingManagerId &&
    this._id &&
    this.reportingManagerId.toString() === this._id.toString()
  ) {
    this.invalidate(
      "reportingManagerId",
      "A user cannot be their own reporting manager.",
    );
  }

  if (this.employeeCode === "") {
    this.employeeCode = null;
  }
});

const CompanyAccess = mongoose.model("CompanyAccess", companyAccessSchema);

export default CompanyAccess;
