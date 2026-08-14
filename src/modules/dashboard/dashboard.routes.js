import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { requireCompanyScope } from "../../middlewares/companyScope.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  getDashboardSummary,
  getTeamLeadDashboardSummary,
} from "./dashboard.controller.js";

import { getDashboardSummarySchema } from "./dashboard.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every Dashboard API requires authentication.
 */
router.use(authenticate);

/**
 * Company dashboard summary.
 *
 * User must:
 * 1. Be authenticated
 * 2. Have dashboard.read
 * 3. Belong to the requested company
 */
router.get(
  "/summary",
  authorize(PERMISSIONS.DASHBOARD_READ),
  requireCompanyScope,
  validate(getDashboardSummarySchema),
  getDashboardSummary,
);

router.get(
  "/team-lead",
  authorize(PERMISSIONS.DASHBOARD_READ),
  requireCompanyScope,
  validate(getDashboardSummarySchema),
  getTeamLeadDashboardSummary,
);

export default router;
