import mongoose from "mongoose";

const TASK_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "COMPLETED",
  "REOPENED",
  "CANCELLED",
];

const TASK_ACTIVITY_TYPES = [
  "CREATED",
  "STARTED",
  "PROGRESS_UPDATED",
  "SUBMITTED",
  "COMPLETED",
  "REOPENED",
  "UPDATED",
  "REASSIGNED",
  "DUE_DATE_CHANGED",
  "PRIORITY_CHANGED",
  "CANCELLED",
  "DELETED",
];

const taskActivitySchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required."],
      index: true,
    },

    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: [true, "Task is required."],
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

    /**
     * Company-context identity of the actor.
     */
    performedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyAccess",
      required: [true, "Performed by is required."],
      index: true,
    },

    /**
     * Actual User identity for auditing.
     */
    performedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required."],
      index: true,
    },

    activityType: {
      type: String,
      required: [true, "Activity type is required."],
      enum: TASK_ACTIVITY_TYPES,
      index: true,
    },

    fromStatus: {
      type: String,
      enum: [...TASK_STATUSES, null],
      default: null,
    },

    toStatus: {
      type: String,
      enum: [...TASK_STATUSES, null],
      default: null,
    },

    note: {
      type: String,
      trim: true,
      default: "",
      maxlength: [5000, "Activity note cannot exceed 5000 characters."],
    },

    /**
     * Flexible evidence related to the activity.
     *
     * Examples:
     *
     * progress:
     * {
     *   previousProgress: 40,
     *   newProgress: 70
     * }
     *
     * reassignment:
     * {
     *   previousAssigneeId,
     *   newAssigneeId
     * }
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/**
 * Complete ticket timeline.
 */
taskActivitySchema.index({
  companyId: 1,
  taskId: 1,
  createdAt: 1,
});

/**
 * Team activity reporting.
 */
taskActivitySchema.index({
  companyId: 1,
  teamId: 1,
  activityType: 1,
  createdAt: -1,
});

/**
 * Actor activity history.
 */
taskActivitySchema.index({
  companyId: 1,
  performedById: 1,
  createdAt: -1,
});

/**
 * Employee performance/event reporting.
 */
taskActivitySchema.index({
  companyId: 1,
  activityType: 1,
  createdAt: -1,
});

const TaskActivity = mongoose.model("TaskActivity", taskActivitySchema);

export default TaskActivity;
