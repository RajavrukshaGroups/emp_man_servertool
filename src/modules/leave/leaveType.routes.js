import express from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  listLeaveTypesSchema,
  getLeaveTypeSchema,
} from "./leave.validation.js";

import {
  createType,
  listTypes,
  getType,
  updateType,
} from "./leaveType.controller.js";

const router = express.Router({
  mergeParams: true,
});

/**
 * ============================================================
 * LEAVE TYPE ROUTES
 * ============================================================
 *
 * Mounted at:
 *
 * /companies/:companyId/leave/types
 */

router.use(authenticate, enforceCompanyContext);

/**
 * CREATE LEAVE TYPE
 */
router.post(
  "/",
  authorize(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate(createLeaveTypeSchema),
  createType,
);

/**
 * LIST LEAVE TYPES
 */
router.get(
  "/",
  authorize(PERMISSIONS.LEAVE_TYPE_READ),
  validate(listLeaveTypesSchema),
  listTypes,
);

/**
 * GET LEAVE TYPE BY ID
 */
router.get(
  "/:leaveTypeId",
  authorize(PERMISSIONS.LEAVE_TYPE_READ),
  validate(getLeaveTypeSchema),
  getType,
);

/**
 * UPDATE LEAVE TYPE
 */
router.patch(
  "/:leaveTypeId",
  authorize(PERMISSIONS.LEAVE_TYPE_MANAGE),
  validate(updateLeaveTypeSchema),
  updateType,
);

export default router;
