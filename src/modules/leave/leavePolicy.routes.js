import express from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createLeavePolicySchema,
  updateLeavePolicySchema,
  listLeavePoliciesSchema,
  getLeavePolicySchema,
} from "./leave.validation.js";

import {
  createPolicy,
  listPolicies,
  getPolicy,
  updatePolicy,
} from "./leavePolicy.controller.js";

const router = express.Router({
  mergeParams: true,
});

/**
 * ============================================================
 * LEAVE POLICY ROUTES
 * ============================================================
 *
 * Mounted at:
 *
 * /companies/:companyId/leave/policies
 */

router.use(authenticate, enforceCompanyContext);

/**
 * ============================================================
 * CREATE LEAVE POLICY
 * ============================================================
 */
router.post(
  "/",
  authorize(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate(createLeavePolicySchema),
  createPolicy,
);

/**
 * ============================================================
 * LIST LEAVE POLICIES
 * ============================================================
 */
router.get(
  "/",
  authorize(PERMISSIONS.LEAVE_TYPE_READ),
  validate(listLeavePoliciesSchema),
  listPolicies,
);

/**
 * ============================================================
 * GET LEAVE POLICY BY ID
 * ============================================================
 */
router.get(
  "/:policyId",
  authorize(PERMISSIONS.LEAVE_TYPE_READ),
  validate(getLeavePolicySchema),
  getPolicy,
);

/**
 * ============================================================
 * UPDATE LEAVE POLICY
 * ============================================================
 */
router.patch(
  "/:policyId",
  authorize(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate(updateLeavePolicySchema),
  updatePolicy,
);

export default router;
