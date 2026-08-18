import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  cancelTask as cancelTaskService,
  completeTask as completeTaskService,
  createTask as createTaskService,
  deleteTask as deleteTaskService,
  getTaskActivities as getTaskActivitiesService,
  getTaskById as getTaskByIdService,
  listTasks as listTasksService,
  reassignTask as reassignTaskService,
  reopenTask as reopenTaskService,
  startTask as startTaskService,
  submitTask as submitTaskService,
  updateTask as updateTaskService,
  updateTaskProgress as updateTaskProgressService,
} from "./task.service.js";
/**
 * Create task.
 */
export const createTask = asyncHandler(async (req, res) => {
  const task = await createTaskService({
    companyId: req.validated.params.companyId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, task, "Task created successfully."));
});

/**
 * List tasks.
 */
export const listTasks = asyncHandler(async (req, res) => {
  const result = await listTasksService({
    companyId: req.validated.params.companyId,
    query: req.validated.query,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Tasks retrieved successfully."));
});

/**
 * Get task.
 */
export const getTaskById = asyncHandler(async (req, res) => {
  const task = await getTaskByIdService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task retrieved successfully."));
});

/**
 * Update task metadata.
 */
export const updateTask = asyncHandler(async (req, res) => {
  const task = await updateTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task updated successfully."));
});

/**
 * Reassign task to another employee.
 *
 * Allowed workflow states:
 *
 * ASSIGNED
 * IN_PROGRESS
 * REOPENED
 *
 * Current progress and workflow state are preserved.
 */
export const reassignTask = asyncHandler(async (req, res) => {
  const task = await reassignTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task reassigned successfully."));
});

/**
 * Start task.
 *
 * ASSIGNED / REOPENED -> IN_PROGRESS
 */
export const startTask = asyncHandler(async (req, res) => {
  const task = await startTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task started successfully."));
});

/**
 * Update progress.
 */
export const updateTaskProgress = asyncHandler(async (req, res) => {
  const task = await updateTaskProgressService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task progress updated successfully."));
});

/**
 * Submit task.
 *
 * IN_PROGRESS -> SUBMITTED
 */
export const submitTask = asyncHandler(async (req, res) => {
  const task = await submitTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task submitted successfully."));
});

/**
 * Complete task.
 *
 * SUBMITTED -> COMPLETED
 */
export const completeTask = asyncHandler(async (req, res) => {
  const task = await completeTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task completed successfully."));
});

/**
 * Reopen task.
 *
 * SUBMITTED / COMPLETED -> REOPENED
 */
export const reopenTask = asyncHandler(async (req, res) => {
  const task = await reopenTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task reopened successfully."));
});

/**
 * Cancel task.
 */
export const cancelTask = asyncHandler(async (req, res) => {
  const task = await cancelTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    payload: req.validated.body,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, task, "Task cancelled successfully."));
});

/**
 * Soft-delete task.
 */
export const deleteTask = asyncHandler(async (req, res) => {
  const result = await deleteTaskService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Task deleted successfully."));
});

/**
 * Get Jira-style activity timeline for a task.
 */
export const getTaskActivities = asyncHandler(async (req, res) => {
  const result = await getTaskActivitiesService({
    companyId: req.validated.params.companyId,
    taskId: req.validated.params.taskId,
    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Task activities retrieved successfully."),
    );
});
