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
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

const router = Router({
  mergeParams: true,
});

router.use(authenticate);

router.post(
  "/",
  authorize(PERMISSIONS.EMPLOYEE_CREATE),
  validate(createEmployeeSchema),
  enforceCompanyContext,
  createEmployee,
);

router.get(
  "/",
  authorize(PERMISSIONS.EMPLOYEE_READ),
  validate(listEmployeesSchema),
  enforceCompanyContext,
  listEmployees,
);

router.get(
  "/:employeeId",
  authorize(PERMISSIONS.EMPLOYEE_READ),
  validate(getEmployeeByIdSchema),
  enforceCompanyContext,
  getEmployeeById,
);

router.patch(
  "/:employeeId",
  authorize(PERMISSIONS.EMPLOYEE_UPDATE),
  validate(updateEmployeeSchema),
  enforceCompanyContext,
  updateEmployee,
);

router.patch(
  "/:employeeId/status",
  authorize(PERMISSIONS.EMPLOYEE_UPDATE),
  validate(updateEmployeeStatusSchema),
  enforceCompanyContext,
  updateEmployeeStatus,
);

router.delete(
  "/:employeeId",
  authorize(PERMISSIONS.EMPLOYEE_DEACTIVATE),
  validate(deleteEmployeeSchema),
  enforceCompanyContext,
  deleteEmployee,
);

export default router;
