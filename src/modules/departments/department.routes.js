import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createDepartment,
  deleteDepartment,
  getDepartmentById,
  listDepartments,
  updateDepartment,
  updateDepartmentStatus,
} from "./department.controller.js";

import {
  createDepartmentSchema,
  deleteDepartmentSchema,
  getDepartmentByIdSchema,
  listDepartmentsSchema,
  updateDepartmentSchema,
  updateDepartmentStatusSchema,
} from "./department.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every department API requires authentication.
 */
router.use(authenticate);

/**
 * Create department.
 */
router.post(
  "/",
  authorize(PERMISSIONS.DEPARTMENT_CREATE),
  validate(createDepartmentSchema),
  createDepartment,
);

/**
 * List departments.
 */
router.get(
  "/",
  authorize(PERMISSIONS.DEPARTMENT_READ),
  validate(listDepartmentsSchema),
  listDepartments,
);

/**
 * Get one department.
 */
router.get(
  "/:departmentId",
  authorize(PERMISSIONS.DEPARTMENT_READ),
  validate(getDepartmentByIdSchema),
  getDepartmentById,
);

/**
 * Update department.
 */
router.patch(
  "/:departmentId",
  authorize(PERMISSIONS.DEPARTMENT_UPDATE),
  validate(updateDepartmentSchema),
  updateDepartment,
);

/**
 * Update department status.
 */
router.patch(
  "/:departmentId/status",
  authorize(PERMISSIONS.DEPARTMENT_UPDATE),
  validate(updateDepartmentStatusSchema),
  updateDepartmentStatus,
);

/**
 * Soft delete department.
 */
router.delete(
  "/:departmentId",
  authorize(PERMISSIONS.DEPARTMENT_DELETE),
  validate(deleteDepartmentSchema),
  deleteDepartment,
);

export default router;
