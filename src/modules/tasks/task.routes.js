import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { requireCompanyScope } from "../../middlewares/companyScope.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  cancelTask,
  completeTask,
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  reassignTask,
  reopenTask,
  startTask,
  submitTask,
  updateTask,
  updateTaskProgress,
  getTaskActivities,
} from "./task.controller.js";

import {
  cancelTaskSchema,
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  getTaskByIdSchema,
  listTasksSchema,
  reassignTaskSchema,
  reopenTaskSchema,
  startTaskSchema,
  submitTaskSchema,
  updateTaskProgressSchema,
  updateTaskSchema,
  getTaskActivitiesSchema,
} from "./task.validation.js";

const router = Router({
  mergeParams: true,
});

router.use(authenticate);
router.use(requireCompanyScope);

/**
 * Create and assign task.
 */
router.post(
  "/",
  authorize(PERMISSIONS.TASK_CREATE, PERMISSIONS.TASK_ASSIGN),
  validate(createTaskSchema),
  createTask,
);

router.get(
  "/",
  authorize(PERMISSIONS.TASK_READ),
  validate(listTasksSchema),
  listTasks,
);

router.get(
  "/:taskId/activities",
  authorize(PERMISSIONS.TASK_READ),
  validate(getTaskActivitiesSchema),
  getTaskActivities,
);

router.get(
  "/:taskId",
  authorize(PERMISSIONS.TASK_READ),
  validate(getTaskByIdSchema),
  getTaskById,
);
/**
 * Update task metadata.
 */
router.patch(
  "/:taskId",
  authorize(PERMISSIONS.TASK_UPDATE),
  validate(updateTaskSchema),
  updateTask,
);

/**
 * Reassign task to another employee.
 *
 * Allowed states:
 *
 * ASSIGNED
 * IN_PROGRESS
 * REOPENED
 *
 * Progress and current workflow state are preserved.
 */
router.patch(
  "/:taskId/reassign",
  authorize(PERMISSIONS.TASK_REASSIGN),
  validate(reassignTaskSchema),
  reassignTask,
);

/**
 * Assignee starts task.
 */
router.patch(
  "/:taskId/start",
  authorize(PERMISSIONS.TASK_UPDATE),
  validate(startTaskSchema),
  startTask,
);

/**
 * Assignee updates progress.
 */
router.patch(
  "/:taskId/progress",
  authorize(PERMISSIONS.TASK_UPDATE),
  validate(updateTaskProgressSchema),
  updateTaskProgress,
);

/**
 * Assignee submits for review.
 */
router.patch(
  "/:taskId/submit",
  authorize(PERMISSIONS.TASK_SUBMIT),
  validate(submitTaskSchema),
  submitTask,
);

/**
 * Team Lead / authorized reviewer completes
 * a submitted task.
 */
router.patch(
  "/:taskId/complete",
  authorize(PERMISSIONS.TASK_COMPLETE),
  validate(completeTaskSchema),
  completeTask,
);

/**
 * Team Lead / authorized reviewer reopens
 * a submitted or completed task.
 */
router.patch(
  "/:taskId/reopen",
  authorize(PERMISSIONS.TASK_REOPEN),
  validate(reopenTaskSchema),
  reopenTask,
);
/**
 * Cancel active task.
 */
router.patch(
  "/:taskId/cancel",
  authorize(PERMISSIONS.TASK_CANCEL),
  validate(cancelTaskSchema),
  cancelTask,
);

/**
 * Soft delete.
 */
router.delete(
  "/:taskId",
  authorize(PERMISSIONS.TASK_CANCEL),
  validate(deleteTaskSchema),
  deleteTask,
);

export default router;
