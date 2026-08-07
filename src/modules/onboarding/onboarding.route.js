import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  getOnboardingByUserId,
  listPendingOnboarding,
} from "./onboarding.controller.js";

import {
  listOnboardingSchema,
  onboardingUserIdParamSchema,
} from "./onboarding.validation.js";

const router = Router();

/**
 * Every onboarding route requires authentication.
 */
router.use(authenticate);

/**
 * List pending onboarding records.
 */
router.get(
  "/",
  authorize("employee.read"),
  validate(listOnboardingSchema),
  listPendingOnboarding,
);

/**
 * Get one onboarding record by user ID.
 */
router.get(
  "/:userId",
  authorize("employee.read"),
  validate(onboardingUserIdParamSchema),
  getOnboardingByUserId,
);

export default router;
