import Task from "./task.model.js";
import TaskActivity from "./taskactivity.model.js";

import CompanyAccess from "../company-access/companyAccess.model.js";
import Team from "../teams/team.model.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * POPULATION
 * ============================================================
 */

const TASK_POPULATE = [
  {
    path: "companyId",
    select: "name legalName code slug logo status",
  },
  {
    path: "departmentId",
    select: "name code description status",
  },
  {
    path: "teamId",
    select: "name code description status",
  },
  {
    path: "assigneeId",
    select:
      "userId roleId employeeCode designation employmentType departmentId teamId status",
    populate: [
      {
        path: "userId",
        select:
          "firstName middleName lastName displayName email mobile profilePhoto status",
      },
      {
        path: "roleId",
        select: "name code scopeType status",
      },
      {
        path: "departmentId",
        select: "name code status",
      },
      {
        path: "teamId",
        select: "name code status",
      },
    ],
  },
  {
    path: "assignedById",
    select: "userId roleId employeeCode designation departmentId teamId status",
    populate: [
      {
        path: "userId",
        select:
          "firstName middleName lastName displayName email mobile profilePhoto status",
      },
      {
        path: "roleId",
        select: "name code scopeType status",
      },
    ],
  },

  {
    path: "reassignmentHistory.fromAssigneeId",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "reassignmentHistory.toAssigneeId",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "reassignmentHistory.reassignedById",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },

  {
    path: "submittedById",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "completedById",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "lastReopenedById",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "cancelledById",
    select: "userId employeeCode designation departmentId teamId status",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "createdBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "updatedBy",
    select: "firstName lastName displayName email",
  },
];

const TASK_ACTIVITY_POPULATE = [
  {
    path: "performedById",
    select: "userId roleId employeeCode designation departmentId teamId status",
    populate: [
      {
        path: "userId",
        select:
          "firstName middleName lastName displayName email mobile profilePhoto status",
      },
      {
        path: "roleId",
        select: "name code scopeType status",
      },
      {
        path: "departmentId",
        select: "name code status",
      },
      {
        path: "teamId",
        select: "name code status",
      },
    ],
  },
  {
    path: "performedByUserId",
    select: "firstName lastName displayName email",
  },
];

/**
 * ============================================================
 * REQUESTER CONTEXT
 * ============================================================
 */

const getRequesterContext = async ({ companyId, requesterUserId }) => {
  const access = await CompanyAccess.findOne({
    companyId,
    userId: requesterUserId,
    isDeleted: false,
    status: "ACTIVE",
  })
    .populate({
      path: "roleId",
      select: "name code scopeType status",
    })
    .lean();

  if (!access) {
    throw new ApiError(403, "You do not have active access to this company.");
  }

  if (!access.roleId || typeof access.roleId !== "object") {
    throw new ApiError(403, "Your company role could not be resolved.");
  }

  if (access.roleId.status !== "ACTIVE") {
    throw new ApiError(403, "Your company role is inactive.");
  }

  const managedTeams = await Team.find({
    companyId,
    teamLeadIds: access._id,
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("_id departmentId")
    .lean();

  return {
    access,
    role: access.roleId,

    managedTeamIds: managedTeams.map((team) => team._id),

    managedTeamIdStrings: managedTeams.map((team) => team._id.toString()),
  };
};

/**
 * ============================================================
 * ACTIVITY
 * ============================================================
 */

const createTaskActivity = async ({
  task,
  requesterContext,
  activityType,
  fromStatus = null,
  toStatus = null,
  note = "",
  metadata = {},
}) => {
  await TaskActivity.create({
    companyId: task.companyId,
    taskId: task._id,

    departmentId: task.departmentId,
    teamId: task.teamId,

    performedById: requesterContext.access._id,

    performedByUserId: requesterContext.access.userId,

    activityType,

    fromStatus,
    toStatus,

    note,
    metadata,
  });
};

/**
 * ============================================================
 * ASSIGNEE VALIDATION
 * ============================================================
 */

const getValidAssignee = async ({ companyId, assigneeId }) => {
  const assignee = await CompanyAccess.findOne({
    _id: assigneeId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  }).lean();

  if (!assignee) {
    throw new ApiError(
      400,
      "Selected task assignee is unavailable or inactive.",
    );
  }

  if (!assignee.departmentId) {
    throw new ApiError(
      400,
      "Selected task assignee does not belong to a department.",
    );
  }

  if (!assignee.teamId) {
    throw new ApiError(
      400,
      "Selected task assignee does not belong to a team.",
    );
  }

  return assignee;
};

/**
 * ============================================================
 * ASSIGNMENT SCOPE
 * ============================================================
 */

const ensureAssigneeWithinRequesterScope = ({ assignee, requesterContext }) => {
  const scopeType = requesterContext.role.scopeType;

  /**
   * Global/company roles with route-level task
   * permission can operate company-wide.
   */
  if (["GLOBAL", "COMPANY"].includes(scopeType)) {
    return;
  }

  /**
   * Department-scoped role.
   */
  if (scopeType === "DEPARTMENT") {
    if (
      !requesterContext.access.departmentId ||
      assignee.departmentId.toString() !==
        requesterContext.access.departmentId.toString()
    ) {
      throw new ApiError(
        403,
        "You can assign tasks only within your department.",
      );
    }

    return;
  }

  /**
   * Team scope.
   *
   * Team Lead can assign only within managed teams.
   */
  if (scopeType === "TEAM") {
    const assigneeTeamId = assignee.teamId.toString();

    if (!requesterContext.managedTeamIdStrings.includes(assigneeTeamId)) {
      throw new ApiError(
        403,
        "You may assign tasks only to employees in your managed teams.",
      );
    }

    return;
  }

  throw new ApiError(403, "Your role scope does not permit task assignment.");
};

/**
 * ============================================================
 * BUILD READ SCOPE
 * ============================================================
 */

const buildTaskScopeFilter = ({ requesterContext }) => {
  const scopeType = requesterContext.role.scopeType;

  if (["GLOBAL", "COMPANY"].includes(scopeType)) {
    return {};
  }

  if (scopeType === "DEPARTMENT") {
    if (!requesterContext.access.departmentId) {
      return {
        _id: null,
      };
    }

    return {
      departmentId: requesterContext.access.departmentId,
    };
  }

  if (scopeType === "TEAM") {
    /**
     * Team Lead.
     */
    if (requesterContext.managedTeamIds.length > 0) {
      return {
        $or: [
          {
            teamId: {
              $in: requesterContext.managedTeamIds,
            },
          },

          /**
           * Allow self-assigned/self-owned tasks
           * if applicable.
           */
          {
            assigneeId: requesterContext.access._id,
          },
        ],
      };
    }

    /**
     * Standard Employee.
     */
    return {
      assigneeId: requesterContext.access._id,
    };
  }

  return {
    _id: null,
  };
};

/**
 * ============================================================
 * TASK ACCESS
 * ============================================================
 */

const ensureTaskReadable = ({ task, requesterContext }) => {
  const scopeType = requesterContext.role.scopeType;

  if (["GLOBAL", "COMPANY"].includes(scopeType)) {
    return;
  }

  if (scopeType === "DEPARTMENT") {
    if (
      requesterContext.access.departmentId &&
      task.departmentId.toString() ===
        requesterContext.access.departmentId.toString()
    ) {
      return;
    }

    throw new ApiError(403, "You do not have access to this task.");
  }

  if (scopeType === "TEAM") {
    if (task.assigneeId.toString() === requesterContext.access._id.toString()) {
      return;
    }

    if (
      requesterContext.managedTeamIdStrings.includes(task.teamId.toString())
    ) {
      return;
    }

    throw new ApiError(403, "You do not have access to this task.");
  }

  throw new ApiError(403, "You do not have access to this task.");
};

/**
 * Management means modifying task metadata,
 * completing, reopening, cancelling or deleting.
 */
const ensureTaskManageable = ({ task, requesterContext }) => {
  const scopeType = requesterContext.role.scopeType;

  if (["GLOBAL", "COMPANY"].includes(scopeType)) {
    return;
  }

  if (scopeType === "DEPARTMENT") {
    if (
      requesterContext.access.departmentId &&
      task.departmentId.toString() ===
        requesterContext.access.departmentId.toString()
    ) {
      return;
    }

    throw new ApiError(403, "You cannot manage this task.");
  }

  if (scopeType === "TEAM") {
    if (
      requesterContext.managedTeamIdStrings.includes(task.teamId.toString())
    ) {
      return;
    }

    throw new ApiError(
      403,
      "You can manage tasks only inside your managed teams.",
    );
  }

  throw new ApiError(403, "You cannot manage this task.");
};

/**
 * ============================================================
 * FIND TASK
 * ============================================================
 */

const findTaskOrFail = async ({ companyId, taskId }) => {
  const task = await Task.findOne({
    _id: taskId,
    companyId,
    isDeleted: false,
  });

  if (!task) {
    throw new ApiError(404, "Task not found.");
  }

  return task;
};

/**
 * ============================================================
 * STATUS CHANGE
 * ============================================================
 */

const changeTaskStatus = async ({
  task,
  requesterContext,
  newStatus,
  activityType,
  note = "",
  metadata = {},
}) => {
  const previousStatus = task.status;

  if (previousStatus === newStatus) {
    throw new ApiError(400, `Task is already in ${newStatus} status.`);
  }

  task.status = newStatus;

  task.statusHistory.push({
    fromStatus: previousStatus,

    toStatus: newStatus,

    changedById: requesterContext.access._id,

    note,

    changedAt: new Date(),
  });

  task.updatedBy = requesterContext.access.userId;

  await task.save();

  await createTaskActivity({
    task,
    requesterContext,

    activityType,

    fromStatus: previousStatus,

    toStatus: newStatus,

    note,
    metadata,
  });

  return task;
};

/**
 * ============================================================
 * POPULATED TASK
 * ============================================================
 */

const getPopulatedTask = async (taskId) => {
  return Task.findById(taskId).populate(TASK_POPULATE).lean();
};

/**
 * ============================================================
 * CREATE
 * ============================================================
 */

export const createTask = async ({ companyId, payload, requesterUserId }) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const assignee = await getValidAssignee({
    companyId,
    assigneeId: payload.assigneeId,
  });

  ensureAssigneeWithinRequesterScope({
    assignee,
    requesterContext,
  });

  const now = new Date();

  const task = await Task.create({
    companyId,

    departmentId: assignee.departmentId,

    teamId: assignee.teamId,

    title: payload.title,

    description: payload.description ?? "",

    priority: payload.priority ?? "MEDIUM",

    assigneeId: assignee._id,

    assignedById: requesterContext.access._id,

    /**
     * Actual work has not started yet.
     */
    startDate: null,

    dueDate: payload.dueDate,

    status: "ASSIGNED",

    progressPercentage: 0,

    workNote: "",

    statusHistory: [
      {
        fromStatus: null,

        toStatus: "ASSIGNED",

        changedById: requesterContext.access._id,

        note: "Task created and assigned.",

        changedAt: now,
      },
    ],

    createdBy: requesterUserId,

    updatedBy: requesterUserId,
  });

  await createTaskActivity({
    task,
    requesterContext,

    activityType: "CREATED",

    fromStatus: null,

    toStatus: "ASSIGNED",

    note: "Task created and assigned.",

    metadata: {
      assigneeId: assignee._id,
    },
  });

  return getPopulatedTask(task._id);
};

/**
 * ============================================================
 * LIST
 * ============================================================
 */

export const listTasks = async ({ companyId, query, requesterUserId }) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const {
    page = 1,
    limit = 10,
    search,
    status,
    priority,
    departmentId,
    teamId,
    assigneeId,
    assignedById,
    dueDateFrom,
    dueDateTo,
    overdue,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  const scopeFilter = buildTaskScopeFilter({
    requesterContext,
  });

  if (Object.keys(scopeFilter).length > 0) {
    Object.assign(filter, scopeFilter);
  }

  const additionalConditions = [];

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const expression = new RegExp(escapedSearch, "i");

    additionalConditions.push({
      $or: [
        {
          title: expression,
        },
        {
          description: expression,
        },
      ],
    });
  }

  if (status) {
    filter.status = status;
  }

  if (priority) {
    filter.priority = priority;
  }

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (teamId) {
    /**
     * Prevent TEAM-scoped users from escaping their scope.
     */
    if (
      requesterContext.role.scopeType === "TEAM" &&
      requesterContext.managedTeamIds.length > 0 &&
      !requesterContext.managedTeamIdStrings.includes(teamId)
    ) {
      throw new ApiError(403, "You do not have access to the requested team.");
    }

    filter.teamId = teamId;
  }

  if (assigneeId) {
    /**
     * Employee cannot query another person's tasks.
     */
    if (
      requesterContext.role.scopeType === "TEAM" &&
      requesterContext.managedTeamIds.length === 0 &&
      assigneeId !== requesterContext.access._id.toString()
    ) {
      throw new ApiError(403, "You can view only your own tasks.");
    }

    filter.assigneeId = assigneeId;
  }

  if (assignedById) {
    filter.assignedById = assignedById;
  }

  if (dueDateFrom || dueDateTo) {
    filter.dueDate = {};

    if (dueDateFrom) {
      filter.dueDate.$gte = dueDateFrom;
    }

    if (dueDateTo) {
      filter.dueDate.$lte = dueDateTo;
    }
  }

  if (overdue === true) {
    filter.dueDate = {
      ...(filter.dueDate || {}),
      $lt: new Date(),
    };

    additionalConditions.push({
      status: {
        $nin: ["COMPLETED", "CANCELLED"],
      },
    });
  }

  if (additionalConditions.length > 0) {
    /**
     * Preserve scope $or while applying search/overdue conditions.
     */
    const existingOr = filter.$or;

    if (existingOr) {
      delete filter.$or;

      additionalConditions.unshift({
        $or: existingOr,
      });
    }

    filter.$and = additionalConditions;
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [records, totalRecords] = await Promise.all([
    Task.find(filter)
      .populate(TASK_POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Task.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    records,

    pagination: {
      page,
      limit,

      totalRecords,

      totalPages,

      hasNextPage: page < totalPages,

      hasPreviousPage: page > 1,
    },
  };
};

/**
 * ============================================================
 * GET ONE
 * ============================================================
 */

export const getTaskById = async ({ companyId, taskId, requesterUserId }) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskReadable({
    task,
    requesterContext,
  });

  return getPopulatedTask(task._id);
};

/**
 * ============================================================
 * GET TASK ACTIVITIES
 * ============================================================
 *
 * Returns the complete Jira-style activity timeline
 * for a task.
 *
 * Access rules are identical to task read access.
 */
export const getTaskActivities = async ({
  companyId,
  taskId,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskReadable({
    task,
    requesterContext,
  });

  const activities = await TaskActivity.find({
    companyId,
    taskId,
  })
    .populate(TASK_ACTIVITY_POPULATE)
    .sort({
      createdAt: 1,
    })
    .lean();

  return {
    taskId: task._id,
    records: activities,
    totalRecords: activities.length,
  };
};

/**
 * ============================================================
 * UPDATE METADATA
 * ============================================================
 */

export const updateTask = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskManageable({
    task,
    requesterContext,
  });

  if (["COMPLETED", "CANCELLED"].includes(task.status)) {
    throw new ApiError(
      400,
      `Task cannot be edited while status is ${task.status}.`,
    );
  }

  const activities = [];

  if (payload.title !== undefined && payload.title !== task.title) {
    activities.push({
      activityType: "UPDATED",

      note: "Task title updated.",

      metadata: {
        previousTitle: task.title,

        newTitle: payload.title,
      },
    });

    task.title = payload.title;
  }

  if (
    payload.description !== undefined &&
    payload.description !== task.description
  ) {
    activities.push({
      activityType: "UPDATED",

      note: "Task description updated.",
    });

    task.description = payload.description;
  }

  if (payload.priority !== undefined && payload.priority !== task.priority) {
    activities.push({
      activityType: "PRIORITY_CHANGED",

      note: "Task priority changed.",

      metadata: {
        previousPriority: task.priority,

        newPriority: payload.priority,
      },
    });

    task.priority = payload.priority;
  }

  if (
    payload.dueDate !== undefined &&
    new Date(payload.dueDate).getTime() !== new Date(task.dueDate).getTime()
  ) {
    activities.push({
      activityType: "DUE_DATE_CHANGED",

      note: "Task due date changed.",

      metadata: {
        previousDueDate: task.dueDate,

        newDueDate: payload.dueDate,
      },
    });

    task.dueDate = payload.dueDate;
  }

  /**
   * Due date cannot already be before the actual start date.
   */
  if (task.startDate && task.dueDate && task.dueDate < task.startDate) {
    throw new ApiError(
      400,
      "Task due date cannot be earlier than the actual task start date.",
    );
  }

  task.updatedBy = requesterUserId;

  await task.save();

  for (const activity of activities) {
    await createTaskActivity({
      task,
      requesterContext,

      activityType: activity.activityType,

      fromStatus: activity.fromStatus ?? null,

      toStatus: activity.toStatus ?? null,

      note: activity.note ?? "",

      metadata: activity.metadata ?? {},
    });
  }

  return getPopulatedTask(task._id);
};

/**
 * ============================================================
 * REASSIGN TASK
 *
 * Transfers current ownership of an active ticket
 * to another employee.
 *
 * Allowed:
 *
 * ASSIGNED
 * IN_PROGRESS
 * REOPENED
 *
 * Important:
 *
 * - status is preserved
 * - progress is preserved
 * - startDate is preserved
 * - workNote is preserved
 * - submission/completion/reopen history is preserved
 * - ticket remains inside the same team
 * ============================================================
 */

export const reassignTask = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  /**
   * Requester must first be allowed to manage
   * the existing ticket.
   */
  ensureTaskManageable({
    task,
    requesterContext,
  });

  /**
   * We don't allow ownership changes while the
   * work is waiting for review or already closed.
   */
  if (!["ASSIGNED", "IN_PROGRESS", "REOPENED"].includes(task.status)) {
    throw new ApiError(
      400,
      `Task cannot be reassigned while status is ${task.status}.`,
    );
  }

  const currentAssigneeId = task.assigneeId.toString();

  if (payload.newAssigneeId === currentAssigneeId) {
    throw new ApiError(
      400,
      "The selected employee is already assigned to this task.",
    );
  }

  /**
   * Resolve and validate the new employee.
   */
  const newAssignee = await getValidAssignee({
    companyId,
    assigneeId: payload.newAssigneeId,
  });

  /**
   * Requester scope must also allow access to
   * the destination employee.
   *
   * Example:
   *
   * Team Lead cannot reassign outside a managed team.
   */
  ensureAssigneeWithinRequesterScope({
    assignee: newAssignee,
    requesterContext,
  });

  /**
   * For the first version, reassignment is intentionally
   * restricted to the SAME TEAM.
   *
   * Cross-team transfer should later be implemented
   * as a separate workflow because it changes team/
   * department responsibility.
   */
  if (newAssignee.teamId.toString() !== task.teamId.toString()) {
    throw new ApiError(
      400,
      "Task reassignment is currently allowed only within the same team.",
    );
  }

  /**
   * Same-team reassignment should naturally also mean
   * the department remains unchanged, but verify it
   * defensively.
   */
  if (newAssignee.departmentId.toString() !== task.departmentId.toString()) {
    throw new ApiError(
      400,
      "The new assignee must belong to the task's current department.",
    );
  }

  const previousAssigneeId = task.assigneeId;

  const progressAtReassignment = task.progressPercentage;

  const statusAtReassignment = task.status;

  const reassignedAt = new Date();

  /**
   * Preserve structured reassignment evidence.
   */
  task.reassignmentHistory.push({
    fromAssigneeId: previousAssigneeId,

    toAssigneeId: newAssignee._id,

    reassignedById: requesterContext.access._id,

    reason: payload.reassignmentReason,

    progressAtReassignment,

    reassignedAt,
  });

  /**
   * Only current ownership changes.
   *
   * DO NOT reset:
   *
   * task.status
   * task.progressPercentage
   * task.startDate
   * task.workNote
   * task.statusHistory
   * task.submission information
   * task.reopen information
   */
  task.assigneeId = newAssignee._id;

  task.updatedBy = requesterUserId;

  await task.save();

  /**
   * Detailed Jira-style timeline entry.
   *
   * There is no status transition during reassignment,
   * so fromStatus/toStatus intentionally remain null.
   */
  await createTaskActivity({
    task,
    requesterContext,

    activityType: "REASSIGNED",

    note: payload.reassignmentReason,

    metadata: {
      previousAssigneeId,

      newAssigneeId: newAssignee._id,

      progressAtReassignment,

      statusAtReassignment,

      reassignedAt,
    },
  });

  return getPopulatedTask(task._id);
};

/**
 * ============================================================
 * START TASK
 *
 * ASSIGNED -> IN_PROGRESS
 * REOPENED -> IN_PROGRESS
 * ============================================================
 */

export const startTask = async ({ companyId, taskId, requesterUserId }) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  if (task.assigneeId.toString() !== requesterContext.access._id.toString()) {
    throw new ApiError(403, "Only the assigned employee can start this task.");
  }

  if (!["ASSIGNED", "REOPENED"].includes(task.status)) {
    throw new ApiError(
      400,
      `Task cannot be started while status is ${task.status}.`,
    );
  }

  /**
   * Preserve the very first actual start timestamp.
   *
   * Later restarts after reopening are recorded
   * through status history + TaskActivity.
   */
  if (!task.startDate) {
    task.startDate = new Date();
  }

  const updatedTask = await changeTaskStatus({
    task,
    requesterContext,

    newStatus: "IN_PROGRESS",

    activityType: "STARTED",

    note:
      task.status === "REOPENED"
        ? "Work resumed on reopened task."
        : "Work started on task.",
  });

  return getPopulatedTask(updatedTask._id);
};

/**
 * ============================================================
 * UPDATE PROGRESS
 * ============================================================
 */

export const updateTaskProgress = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  if (task.assigneeId.toString() !== requesterContext.access._id.toString()) {
    throw new ApiError(
      403,
      "Only the assigned employee can update task progress.",
    );
  }

  if (task.status !== "IN_PROGRESS") {
    throw new ApiError(
      400,
      "Task progress can only be updated while the task is in progress.",
    );
  }

  const previousProgress = task.progressPercentage;

  const previousWorkNote = task.workNote;

  task.progressPercentage = payload.progressPercentage;

  task.workNote = payload.workNote ?? "";

  task.updatedBy = requesterUserId;

  await task.save();

  await createTaskActivity({
    task,
    requesterContext,

    activityType: "PROGRESS_UPDATED",

    note:
      payload.workNote || `Progress updated to ${payload.progressPercentage}%.`,

    metadata: {
      previousProgress,

      newProgress: payload.progressPercentage,

      previousWorkNote,

      newWorkNote: payload.workNote ?? "",
    },
  });

  return getPopulatedTask(task._id);
};

/**
 * ============================================================
 * SUBMIT
 *
 * IN_PROGRESS -> SUBMITTED
 * ============================================================
 */

export const submitTask = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  if (task.assigneeId.toString() !== requesterContext.access._id.toString()) {
    throw new ApiError(403, "Only the assigned employee can submit this task.");
  }

  if (task.status !== "IN_PROGRESS") {
    throw new ApiError(400, "Only an in-progress task can be submitted.");
  }

  const now = new Date();

  /**
   * Submitting means employee considers the work complete.
   */
  task.progressPercentage = 100;

  task.submittedAt = now;

  task.submittedById = requesterContext.access._id;

  task.submissionNote = payload.submissionNote ?? "";

  const updatedTask = await changeTaskStatus({
    task,
    requesterContext,

    newStatus: "SUBMITTED",

    activityType: "SUBMITTED",

    note: payload.submissionNote || "Task submitted for review.",
  });

  return getPopulatedTask(updatedTask._id);
};

/**
 * ============================================================
 * COMPLETE
 *
 * SUBMITTED -> COMPLETED
 * ============================================================
 */

export const completeTask = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskManageable({
    task,
    requesterContext,
  });

  if (task.status !== "SUBMITTED") {
    throw new ApiError(400, "Only a submitted task can be completed.");
  }

  task.completedAt = new Date();

  task.completedById = requesterContext.access._id;

  task.completionNote = payload.completionNote ?? "";

  task.progressPercentage = 100;

  const updatedTask = await changeTaskStatus({
    task,
    requesterContext,

    newStatus: "COMPLETED",

    activityType: "COMPLETED",

    note: payload.completionNote || "Task reviewed and marked as completed.",
  });

  return getPopulatedTask(updatedTask._id);
};

/**
 * ============================================================
 * REOPEN
 *
 * SUBMITTED -> REOPENED
 * COMPLETED -> REOPENED
 *
 * This supports:
 *
 * - Work not satisfactory during review
 * - A closed ticket needing further work later
 * ============================================================
 */

export const reopenTask = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskManageable({
    task,
    requesterContext,
  });

  if (!["SUBMITTED", "COMPLETED"].includes(task.status)) {
    throw new ApiError(
      400,
      "Only submitted or completed tasks can be reopened.",
    );
  }

  const previousStatus = task.status;

  const now = new Date();

  task.reopenCount += 1;

  task.lastReopenedAt = now;

  task.lastReopenedById = requesterContext.access._id;

  task.reopenReason = payload.reopenReason;

  /**
   * We deliberately keep:
   *
   * completedAt
   * completedById
   * completionNote
   *
   * if the task had been completed before.
   *
   * That gives us the latest previous completion
   * while TaskActivity permanently preserves all cycles.
   */

  const updatedTask = await changeTaskStatus({
    task,
    requesterContext,

    newStatus: "REOPENED",

    activityType: "REOPENED",

    note: payload.reopenReason,

    metadata: {
      previousStatus,

      reopenCount: task.reopenCount,
    },
  });

  return getPopulatedTask(updatedTask._id);
};

/**
 * ============================================================
 * CANCEL
 * ============================================================
 */

export const cancelTask = async ({
  companyId,
  taskId,
  payload,
  requesterUserId,
}) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskManageable({
    task,
    requesterContext,
  });

  if (task.status === "CANCELLED") {
    throw new ApiError(400, "Task is already cancelled.");
  }

  /**
   * Closed work should be reopened rather than cancelled.
   */
  if (task.status === "COMPLETED") {
    throw new ApiError(
      400,
      "Completed tasks cannot be cancelled. Reopen the ticket if further work is required.",
    );
  }

  task.cancelledAt = new Date();

  task.cancelledById = requesterContext.access._id;

  task.cancellationReason = payload.cancellationReason;

  const updatedTask = await changeTaskStatus({
    task,
    requesterContext,

    newStatus: "CANCELLED",

    activityType: "CANCELLED",

    note: payload.cancellationReason,
  });

  return getPopulatedTask(updatedTask._id);
};

/**
 * ============================================================
 * DELETE
 *
 * Soft delete only.
 * ============================================================
 */

export const deleteTask = async ({ companyId, taskId, requesterUserId }) => {
  const requesterContext = await getRequesterContext({
    companyId,
    requesterUserId,
  });

  const task = await findTaskOrFail({
    companyId,
    taskId,
  });

  ensureTaskManageable({
    task,
    requesterContext,
  });

  /**
   * Completed tasks are part of performance/work history.
   */
  if (task.status === "COMPLETED") {
    throw new ApiError(
      400,
      "Completed tasks cannot be deleted because they are part of employee work history.",
    );
  }

  const deletedAt = new Date();

  /**
   * Write activity before hiding the task.
   */
  await createTaskActivity({
    task,
    requesterContext,

    activityType: "DELETED",

    note: "Task soft-deleted.",
  });

  task.isDeleted = true;

  task.deletedAt = deletedAt;

  task.deletedBy = requesterUserId;

  task.updatedBy = requesterUserId;

  await task.save();

  return {
    taskId: task._id,

    deletedAt,
  };
};
