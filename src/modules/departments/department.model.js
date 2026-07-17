import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Department name is required."],
      trim: true,
      minlength: [
        2,
        "Department name must contain at least 2 characters.",
      ],
      maxlength: [
        100,
        "Department name cannot exceed 100 characters.",
      ],
    },

    code: {
      type: String,
      required: [true, "Department code is required."],
      trim: true,
      uppercase: true,
      minlength: [
        2,
        "Department code must contain at least 2 characters.",
      ],
      maxlength: [
        20,
        "Department code cannot exceed 20 characters.",
      ],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        1000,
        "Department description cannot exceed 1000 characters.",
      ],
    },

    departmentHeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
      index: true,
    },

    parentDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
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

/**
 * Department name must be unique inside a company.
 *
 * Different companies can use the same department name.
 */
departmentSchema.index(
  {
    companyId: 1,
    name: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * Department code must be unique inside a company.
 */
departmentSchema.index(
  {
    companyId: 1,
    code: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

departmentSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

departmentSchema.index({
  companyId: 1,
  parentDepartmentId: 1,
  isDeleted: 1,
});

departmentSchema.index({
  companyId: 1,
  createdAt: -1,
});

/**
 * Normalize name and code before validation.
 */
departmentSchema.pre("validate", function normalizeDepartment() {
  if (typeof this.name === "string") {
    this.name = this.name
      .replace(/\s+/g, " ")
      .trim();
  }

  if (typeof this.code === "string") {
    this.code = this.code
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toUpperCase()
      .trim();
  }
});

const Department = mongoose.model(
  "Department",
  departmentSchema,
);

export default Department;