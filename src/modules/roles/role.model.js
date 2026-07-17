import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },

    name: {
      type: String,
      required: [true, "Role name is required."],
      trim: true,
      minlength: [2, "Role name must contain at least 2 characters."],
      maxlength: [100, "Role name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Role code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Role code must contain at least 2 characters."],
      maxlength: [50, "Role code cannot exceed 50 characters."],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Role description cannot exceed 500 characters."],
      default: "",
    },

    permissionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],

    scopeType: {
      type: String,
      enum: ["GLOBAL", "COMPANY"],
      default: "COMPANY",
      index: true,
    },

    isSystemRole: {
      type: Boolean,
      default: false,
    },

    isEditable: {
      type: Boolean,
      default: true,
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

roleSchema.index(
  {
    companyId: 1,
    code: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      companyId: {
        $type: "objectId",
      },
    },
  },
);

roleSchema.index(
  {
    code: 1,
    scopeType: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      scopeType: "GLOBAL",
    },
  },
);

roleSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

roleSchema.index({
  name: 1,
});

roleSchema.index({
  createdAt: -1,
});

roleSchema.pre("validate", function roleScopeValidation() {
  if (this.scopeType === "GLOBAL" && this.companyId) {
    this.invalidate(
      "companyId",
      "Global roles must not be assigned to a company.",
    );
  }

  if (this.scopeType === "COMPANY" && !this.companyId) {
    this.invalidate(
      "companyId",
      "Company-specific roles must belong to a company.",
    );
  }

  if (this.isSystemRole && this.scopeType === "GLOBAL") {
    this.isEditable = false;
  }
});

const Role = mongoose.model("Role", roleSchema);

export default Role;
