import { Router } from "express";

import companyRoutes from "../modules/companies/company.routes.js";
import permissionRoutes from "../modules/permissions/permission.routes.js";
import roleRoutes from "../modules/roles/role.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import {
  userCompanyAccessRouter,
  companyAccessRouter,
} from "../modules/company-access/companyAccess.routes.js";
import authRoutes from "../modules/auth/auth.routes.js";
import departmentRoutes from "../modules/departments/department.routes.js";
import teamRoutes from "../modules/teams/team.routes.js";
import employeeRoutes from "../modules/employees/employee.routes.js";

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
      new ApiResponse(
        200,
        healthData,
        "Employee Management API is running.",
      ),
    );
});

router.use("/auth", authRoutes);

router.use("/permissions", permissionRoutes);
router.use("/companies", companyRoutes);
router.use("/companies/:companyId/roles", roleRoutes);
router.use("/users", userRoutes);
router.use("/companies/:companyId/access", companyAccessRouter);
router.use("/companies/:companyId/departments", departmentRoutes);
router.use("/companies/:companyId/teams", teamRoutes);
router.use("/companies/:companyId/employees", employeeRoutes);
router.use("/users/:userId/company-access", userCompanyAccessRouter);

export default router;