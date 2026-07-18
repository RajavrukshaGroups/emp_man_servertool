import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department is required."],
      index: true,
    },

    name: {
      type: String,
      required: [true, "Team name is required."],
      trim: true,
      minlength: [2, "Team name must contain at least 2 characters."],
      maxlength: [100, "Team name cannot exceed 100 characters."],
    },

    code: {
      type: String,
      required: [true, "Team code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Team code must contain at least 2 characters."],
      maxlength: [20, "Team code cannot exceed 20 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Team description cannot exceed 1000 characters."],
    },

    /**
     * A team can have multiple team leads.
     *
     * These IDs reference CompanyAccess records instead of User records
     * so the system can confirm that the lead belongs to the company.
     */
    teamLeadIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CompanyAccess",
      },
    ],

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
 * Team name must be unique inside a department.
 *
 * Different departments can use the same team name.
 */
teamSchema.index(
  {
    companyId: 1,
    departmentId: 1,
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
 * Team code must be unique inside a company.
 */
teamSchema.index(
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

teamSchema.index({
  companyId: 1,
  departmentId: 1,
  status: 1,
  isDeleted: 1,
});

teamSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

teamSchema.index({
  companyId: 1,
  createdAt: -1,
});

teamSchema.index({
  companyId: 1,
  teamLeadIds: 1,
  isDeleted: 1,
});

/**
 * Normalize name, code and team lead IDs before validation.
 */
teamSchema.pre("validate", function normalizeTeam() {
  if (typeof this.name === "string") {
    this.name = this.name.replace(/\s+/g, " ").trim();
  }

  if (typeof this.code === "string") {
    this.code = this.code
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toUpperCase()
      .trim();
  }

  if (Array.isArray(this.teamLeadIds)) {
    this.teamLeadIds = [
      ...new Map(
        this.teamLeadIds.map((teamLeadId) => [
          teamLeadId.toString(),
          teamLeadId,
        ]),
      ).values(),
    ];
  }
});

const Team = mongoose.model("Team", teamSchema);

export default Team;
