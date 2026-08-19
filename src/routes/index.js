import { Router } from "express";

import companyRoutes from "../modules/companies/company.routes.js";
import permissionRoutes from "../modules/permissions/permission.routes.js";
import roleRoutes from "../modules/roles/role.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import platformAccessRoutes, {
  platformRoleRouter,
} from "../modules/platform-access/platformAccess.routes.js";
import {
  userCompanyAccessRouter,
  companyAccessRouter,
} from "../modules/company-access/companyAccess.routes.js";

import authRoutes from "../modules/auth/auth.routes.js";
import departmentRoutes from "../modules/departments/department.routes.js";
import teamRoutes from "../modules/teams/team.routes.js";
import employeeRoutes from "../modules/employees/employee.routes.js";
import taskRoutes from "../modules/tasks/task.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import onboardingRoutes from "../modules/onboarding/onboarding.route.js";
import companyAdministratorRoutes from "../modules/company-administrators/companyAdministrator.routes.js";
import clientRoutes from "../modules/clients/client.routes.js";
import workCategoryRoutes from "../modules/work-categories/workCategory.routes.js";

import { ApiResponse } from "../utils/ApiResponse.js";

const router = Router();

router.get("/health", (req, res) => {
  const healthData = {
    application: "Employee Management Server",
    status: "healthy",
    environment: process.env.NODE_ENV || "development",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  };

  return res
    .status(200)
    .json(
      new ApiResponse(200, healthData, "Employee Management API is running."),
    );
});

/**
 * Authentication
 */
router.use("/auth", authRoutes);

/**
 * Global resources
 */
router.use("/permissions", permissionRoutes);
router.use("/users", userRoutes);
router.use("/users/:userId/company-access", userCompanyAccessRouter);

/**
 * Platform administration
 */
router.use("/platform/admins", platformAccessRoutes);
router.use("/platform/roles", platformRoleRouter);
/**
 * IMPORTANT:
 * Company-specific nested routes MUST come before
 * the generic /companies router.
 */
router.use("/companies/:companyId/administrators", companyAdministratorRoutes);

router.use("/companies/:companyId/roles", roleRoutes);

router.use("/companies/:companyId/access", companyAccessRouter);

router.use("/companies/:companyId/departments", departmentRoutes);

router.use("/companies/:companyId/teams", teamRoutes);

router.use("/companies/:companyId/work-categories", workCategoryRoutes);

router.use("/companies/:companyId/clients", clientRoutes);

router.use("/companies/:companyId/employees", employeeRoutes);

router.use("/companies/:companyId/tasks", taskRoutes);

router.use("/companies/:companyId/dashboard", dashboardRoutes);

/**
 * Generic company-management routes.
 *
 * Keep this AFTER all company nested routes.
 */
router.use("/companies", companyRoutes);

/**
 * Onboarding
 */
router.use("/onboarding", onboardingRoutes);

export default router;
