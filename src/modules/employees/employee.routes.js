import { Router } from "express";

import {
  createEmployee,
  listEmployees,
  getEmployeeById,
  updateEmployee,
  updateEmployeeStatus,
  deleteEmployee,
} from "./employee.controller.js";

import {
  createEmployeeSchema,
  listEmployeesSchema,
  getEmployeeByIdSchema,
  updateEmployeeSchema,
  updateEmployeeStatusSchema,
  deleteEmployeeSchema,
} from "./employee.validation.js";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";

const router = Router({
  mergeParams: true,
});

router.use(authenticate);

router.post(
  "/",
  authorize(PERMISSIONS.EMPLOYEE_CREATE),
  validate(createEmployeeSchema),
  createEmployee,
);

router.get(
  "/",
  authorize(PERMISSIONS.EMPLOYEE_READ),
  validate(listEmployeesSchema),
  listEmployees,
);

router.get(
  "/:employeeId",
  authorize(PERMISSIONS.EMPLOYEE_READ),
  validate(getEmployeeByIdSchema),
  getEmployeeById,
);

router.patch(
  "/:employeeId",
  authorize(PERMISSIONS.EMPLOYEE_UPDATE),
  validate(updateEmployeeSchema),
  updateEmployee,
);

router.patch(
  "/:employeeId/status",
  authorize(PERMISSIONS.EMPLOYEE_UPDATE),
  validate(updateEmployeeStatusSchema),
  updateEmployeeStatus,
);

router.delete(
  "/:employeeId",
  authorize(PERMISSIONS.EMPLOYEE_DEACTIVATE),
  validate(deleteEmployeeSchema),
  deleteEmployee,
);

export default router;