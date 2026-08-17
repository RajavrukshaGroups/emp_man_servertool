import mongoose from "mongoose";

const TASK_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "COMPLETED",
  "REOPENED",
  "CANCELLED",
];

/**
 * Lightweight status transition history stored directly
 * inside the task.
 *
 * Detailed activity history is stored separately
 * inside TaskActivity.
 */
const taskStatusHistorySchema = new mongoose.Schema(
  {
    fromStatus: {
      type: String,
      enum: [...TASK_STATUSES, null],
      default: null,
    },

    toStatus: {
      type: String,
      enum: TASK_STATUSES,
      required: [true, "New task status is required."],
    },

    changedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Status changed by is required."],
    },

    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Status history note cannot exceed 3000 characters."],
    },

    changedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    _id: true,
    versionKey: false,
  },
);

const taskSchema = new mongoose.Schema(
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

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: [true, "Team is required."],
      index: true,
    },

    title: {
      type: String,
      required: [true, "Task title is required."],
      trim: true,
      minlength: [3, "Task title must contain at least 3 characters."],
      maxlength: [200, "Task title cannot exceed 200 characters."],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Task description cannot exceed 5000 characters."],
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
      index: true,
    },

    /**
     * CompanyAccess of the employee/team member
     * currently responsible for the task.
     */
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Task assignee is required."],
      index: true,
    },

    /**
     * CompanyAccess of the person who originally
     * assigned/created the task.
     */
    assignedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Task assigner is required."],
      index: true,
    },

    /**
     * Actual first time the assignee started working.
     *
     * This is NOT supplied while creating the task.
     */
    startDate: {
      type: Date,
      default: null,
      index: true,
    },

    dueDate: {
      type: Date,
      required: [true, "Task due date is required."],
      index: true,
    },

    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "ASSIGNED",
      index: true,
    },

    /**
     * Lightweight status transition timeline.
     */
    statusHistory: {
      type: [taskStatusHistorySchema],
      default: [],
    },

    /**
     * Current task progress.
     *
     * Detailed changes are preserved inside TaskActivity.
     */
    progressPercentage: {
      type: Number,
      min: [0, "Progress percentage cannot be below 0."],
      max: [100, "Progress percentage cannot exceed 100."],
      default: 0,
    },

    /**
     * Latest working note.
     *
     * Previous updates remain available in TaskActivity.
     */
    workNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Work note cannot exceed 3000 characters."],
    },

    /**
     * Latest submission.
     *
     * Earlier submissions are preserved in TaskActivity.
     */
    submittedAt: {
      type: Date,
      default: null,
      index: true,
    },

    submittedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
    },

    submissionNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Submission note cannot exceed 3000 characters."],
    },

    /**
     * Latest completion.
     *
     * If a task is reopened later, we do NOT destroy
     * historical completion events. TaskActivity keeps them.
     *
     * On the next completion these fields represent
     * the latest completion.
     */
    completedAt: {
      type: Date,
      default: null,
      index: true,
    },

    completedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
    },

    completionNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Completion note cannot exceed 3000 characters."],
    },

    /**
     * Reopen information.
     */
    reopenCount: {
      type: Number,
      min: [0, "Reopen count cannot be negative."],
      default: 0,
    },

    lastReopenedAt: {
      type: Date,
      default: null,
      index: true,
    },

    lastReopenedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
    },

    /**
     * Latest reopen reason.
     *
     * Older reasons remain available in TaskActivity.
     */
    reopenReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: [3000, "Reopen reason cannot exceed 3000 characters."],
    },

    /**
     * Cancellation information.
     */
    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: [2000, "Cancellation reason cannot exceed 2000 characters."],
    },

    /**
     * Database audit fields.
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
 * Company task listing.
 */
taskSchema.index({
  companyId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Team Lead task listing.
 */
taskSchema.index({
  companyId: 1,
  teamId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Employee's own task listing.
 */
taskSchema.index({
  companyId: 1,
  assigneeId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Department reporting.
 */
taskSchema.index({
  companyId: 1,
  departmentId: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Due date monitoring.
 */
taskSchema.index({
  companyId: 1,
  dueDate: 1,
  status: 1,
  isDeleted: 1,
});

/**
 * Employee completion/performance reporting.
 */
taskSchema.index({
  companyId: 1,
  assigneeId: 1,
  completedAt: -1,
});

/**
 * Reopened-ticket reporting.
 */
taskSchema.index({
  companyId: 1,
  assigneeId: 1,
  reopenCount: -1,
});

/**
 * Model consistency validation.
 */
taskSchema.pre("validate", function validateTaskState() {
  if (this.startDate && this.dueDate && this.dueDate < this.startDate) {
    this.invalidate(
      "dueDate",
      "Task due date cannot be earlier than the actual task start date.",
    );
  }

  /**
   * Newly assigned tasks have not started.
   */
  if (this.status === "ASSIGNED") {
    if (this.progressPercentage !== 0) {
      this.invalidate(
        "progressPercentage",
        "Assigned tasks must have 0% progress.",
      );
    }

    if (this.startDate) {
      this.invalidate(
        "startDate",
        "Assigned tasks cannot have an actual start date.",
      );
    }
  }

  /**
   * Submission and completion represent 100% work
   * from the employee perspective.
   */
  if (
    ["SUBMITTED", "COMPLETED"].includes(this.status) &&
    this.progressPercentage !== 100
  ) {
    this.invalidate(
      "progressPercentage",
      `${this.status} tasks must have 100% progress.`,
    );
  }

  if (this.status === "SUBMITTED") {
    if (!this.submittedAt) {
      this.invalidate(
        "submittedAt",
        "Submission timestamp is required for submitted tasks.",
      );
    }

    if (!this.submittedById) {
      this.invalidate(
        "submittedById",
        "Submitted by is required for submitted tasks.",
      );
    }
  }

  if (this.status === "COMPLETED") {
    if (!this.completedAt) {
      this.invalidate(
        "completedAt",
        "Completion timestamp is required for completed tasks.",
      );
    }

    if (!this.completedById) {
      this.invalidate(
        "completedById",
        "Completed by is required for completed tasks.",
      );
    }
  }

  if (this.status === "REOPENED") {
    if (!this.lastReopenedAt) {
      this.invalidate(
        "lastReopenedAt",
        "Reopened timestamp is required for reopened tasks.",
      );
    }

    if (!this.lastReopenedById) {
      this.invalidate(
        "lastReopenedById",
        "Reopened by is required for reopened tasks.",
      );
    }

    if (!this.reopenReason) {
      this.invalidate(
        "reopenReason",
        "Reopen reason is required for reopened tasks.",
      );
    }
  }

  if (this.status === "CANCELLED") {
    if (!this.cancelledAt) {
      this.invalidate(
        "cancelledAt",
        "Cancellation timestamp is required for cancelled tasks.",
      );
    }

    if (!this.cancelledById) {
      this.invalidate(
        "cancelledById",
        "Cancelled by is required for cancelled tasks.",
      );
    }

    if (!this.cancellationReason) {
      this.invalidate(
        "cancellationReason",
        "Cancellation reason is required for cancelled tasks.",
      );
    }
  }
});

const Task = mongoose.model("Task", taskSchema);

export default Task;
