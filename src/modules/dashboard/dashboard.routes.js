import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";

import { getDashboardSummary } from "./dashboard.controller.js";

import { getDashboardSummarySchema } from "./dashboard.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every Dashboard API requires authentication.
 */
router.use(authenticate);

router.get(
  "/summary",
  authorize(PERMISSIONS.DASHBOARD_READ),
  validate(getDashboardSummarySchema),
  getDashboardSummary,
);

export default router;
