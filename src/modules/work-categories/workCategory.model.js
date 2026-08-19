import mongoose from "mongoose";

const workCategorySchema = new mongoose.Schema(
  {
    /**
     * ============================================================
     * COMPANY
     * ============================================================
     */

    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    /**
     * ============================================================
     * DEPARTMENT
     * ============================================================
     *
     * Every work category belongs to a department.
     *
     * Examples:
     *
     * Graphic Designing
     * Digital Marketing
     * Website Development
     */
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department is required."],
      index: true,
    },

    /**
     * ============================================================
     * TEAM
     * ============================================================
     *
     * Every work category belongs to a specific team
     * under the selected department.
     *
     * Example:
     *
     * Graphic Designing
     *   → Team 1
     *       → Creative
     *       → Reel
     *       → Banner
     *
     *   → Team 2
     *       → Creative
     *       → Reel
     *
     * The service layer must verify:
     *
     * team.companyId === companyId
     * team.departmentId === departmentId
     */
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team is required."],
      index: true,
    },

    /**
     * ============================================================
     * CATEGORY NAME
     * ============================================================
     */

    name: {
      type: String,
      required: [true, "Work category name is required."],
      trim: true,
      minlength: [2, "Work category name must contain at least 2 characters."],
      maxlength: [100, "Work category name cannot exceed 100 characters."],
    },

    /**
     * ============================================================
     * CATEGORY CODE
     * ============================================================
     *
     * Examples:
     *
     * CREATIVE
     * REEL
     * BANNER
     * SOCIAL_MEDIA_POST
     * META_ADS
     * SEO
     * LANDING_PAGE
     * BUG_FIX
     */
    code: {
      type: String,
      required: [true, "Work category code is required."],
      trim: true,
      uppercase: true,
      minlength: [2, "Work category code must contain at least 2 characters."],
      maxlength: [40, "Work category code cannot exceed 40 characters."],
    },

    /**
     * ============================================================
     * DESCRIPTION
     * ============================================================
     */

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [
        1000,
        "Work category description cannot exceed 1000 characters.",
      ],
    },

    /**
     * ============================================================
     * REPORTING UNIT
     * ============================================================
     *
     * Used for quantity-based reporting.
     *
     * Examples:
     *
     * Creative     → creative
     * Reel         → reel
     * Banner       → banner
     * Landing Page → page
     * Bug Fix      → issue
     * SEO Activity → activity
     */
    unitLabel: {
      type: String,
      trim: true,
      default: "item",
      minlength: [
        1,
        "Work category unit label must contain at least 1 character.",
      ],
      maxlength: [50, "Work category unit label cannot exceed 50 characters."],
    },

    /**
     * ============================================================
     * WORKLOAD WEIGHT
     * ============================================================
     *
     * Optional workload/reporting indicator.
     *
     * IMPORTANT:
     *
     * This must not directly be treated as an employee
     * performance score.
     *
     * Example:
     *
     * Creative     → 1
     * Reel         → 2
     * Landing Page → 5
     *
     * This may later help management understand workload
     * distribution, but task history, timeliness and rework
     * evidence must still be considered separately.
     */
    workloadWeight: {
      type: Number,
      min: [0.1, "Workload weight must be at least 0.1."],
      max: [100, "Workload weight cannot exceed 100."],
      default: 1,
    },

    /**
     * ============================================================
     * STATUS
     * ============================================================
     */

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },

    /**
     * ============================================================
     * AUDIT
     * ============================================================
     */

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
 * ============================================================
 * UNIQUE CATEGORY NAME
 * ============================================================
 *
 * The same category name cannot exist twice
 * inside the same team.
 *
 * But different teams may use the same category.
 *
 * Example:
 *
 * Graphic Designing
 *
 * Team 1 → Creative
 * Team 2 → Creative
 *
 * Valid.
 */
workCategorySchema.index(
  {
    companyId: 1,
    departmentId: 1,
    teamId: 1,
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
 * ============================================================
 * UNIQUE CATEGORY CODE
 * ============================================================
 *
 * Category code must be unique inside the same team.
 *
 * Different teams may use the same category code.
 *
 * Example:
 *
 * Team 1 → Creative → CREATIVE
 * Team 2 → Creative → CREATIVE
 *
 * Valid.
 */
workCategorySchema.index(
  {
    companyId: 1,
    departmentId: 1,
    teamId: 1,
    code: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

/**
 * ============================================================
 * TEAM-SPECIFIC CATEGORY LISTING
 * ============================================================
 */

workCategorySchema.index({
  companyId: 1,
  departmentId: 1,
  teamId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * DEPARTMENT-SPECIFIC REPORTING
 * ============================================================
 */

workCategorySchema.index({
  companyId: 1,
  departmentId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * COMPANY-WIDE CATEGORY LISTING
 * ============================================================
 */

workCategorySchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * ============================================================
 * RECENT CATEGORY LISTING
 * ============================================================
 */

workCategorySchema.index({
  companyId: 1,
  createdAt: -1,
});

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

workCategorySchema.pre("validate", function normalizeWorkCategory() {
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

  if (typeof this.description === "string") {
    this.description = this.description.trim();
  }

  if (typeof this.unitLabel === "string") {
    this.unitLabel = this.unitLabel.replace(/\s+/g, " ").trim().toLowerCase();
  }
});

const WorkCategory = mongoose.model("WorkCategory", workCategorySchema);

export default WorkCategory;
