import express from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createLeaveRequestSchema,
  listLeaveRequestsSchema,
  getLeaveRequestSchema,
  recommendLeaveRequestSchema,
  approveLeaveRequestSchema,
  rejectLeaveRequestSchema,
  cancelLeaveRequestSchema,
  requestApprovedLeaveCancellationSchema,
  approveLeaveCancellationSchema,
  rejectLeaveCancellationSchema,
} from "./leave.validation.js";

import {
  createLeave,
  listLeaves,
  getLeave,
  recommendLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  requestApprovedCancellation,
  approveLeaveCancellation,
  rejectLeaveCancellation,
} from "./leaveRequest.controller.js";

const router = express.Router({
  mergeParams: true,
});

/**
 * ============================================================
 * LEAVE REQUEST ROUTES
 * ============================================================
 *
 * Mounted at:
 *
 * /companies/:companyId/leave/requests
 */

router.use(authenticate, enforceCompanyContext);

/**
 * ============================================================
 * CREATE OWN LEAVE REQUEST
 * ============================================================
 *
 * POST /companies/:companyId/leave/requests
 *
 * Employee identity is resolved from authentication.
 */
router.post(
  "/",
  authorize(PERMISSIONS.LEAVE_APPLY),
  validate(createLeaveRequestSchema),
  createLeave,
);

/**
 * ============================================================
 * LIST LEAVE REQUESTS
 * ============================================================
 *
 * GET /companies/:companyId/leave/requests
 *
 * Scope is enforced in leaveRequest.service + leave.scope:
 *
 * COMPANY
 * -> company leave requests
 *
 * DEPARTMENT
 * -> department leave requests
 *
 * TEAM
 * -> managed teams + self
 *
 * Employee/self scope
 * -> self only
 */
router.get(
  "/",
  authorize(PERMISSIONS.LEAVE_READ),
  validate(listLeaveRequestsSchema),
  listLeaves,
);

/**
 * ============================================================
 * RECOMMEND LEAVE REQUEST
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/recommend
 *
 * Usually Team Lead / Manager.
 */
router.post(
  "/:leaveRequestId/recommend",
  authorize(PERMISSIONS.LEAVE_RECOMMEND),
  validate(recommendLeaveRequestSchema),
  recommendLeave,
);

/**
 * ============================================================
 * APPROVE LEAVE REQUEST
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/approve
 */
router.post(
  "/:leaveRequestId/approve",
  authorize(PERMISSIONS.LEAVE_APPROVE),
  validate(approveLeaveRequestSchema),
  approveLeave,
);

/**
 * ============================================================
 * REJECT LEAVE REQUEST
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/reject
 */
router.post(
  "/:leaveRequestId/reject",
  authorize(PERMISSIONS.LEAVE_REJECT),
  validate(rejectLeaveRequestSchema),
  rejectLeave,
);

/**
 * ============================================================
 * CANCEL OWN PENDING / RECOMMENDED LEAVE
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancel
 *
 * Service layer verifies ownership and applicable policy.
 */
router.post(
  "/:leaveRequestId/cancel",
  authorize(PERMISSIONS.LEAVE_CANCEL),
  validate(cancelLeaveRequestSchema),
  cancelLeave,
);

/**
 * ============================================================
 * REQUEST CANCELLATION OF APPROVED LEAVE
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancellation-request
 *
 * Employee requests cancellation of their own approved leave.
 */
router.post(
  "/:leaveRequestId/cancellation-request",
  authorize(PERMISSIONS.LEAVE_CANCEL),
  validate(requestApprovedLeaveCancellationSchema),
  requestApprovedCancellation,
);

/**
 * ============================================================
 * APPROVE APPROVED-LEAVE CANCELLATION
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancellation/approve
 *
 * Managerial action.
 */
router.post(
  "/:leaveRequestId/cancellation/approve",
  authorize(PERMISSIONS.LEAVE_APPROVE),
  validate(approveLeaveCancellationSchema),
  approveLeaveCancellation,
);

/**
 * ============================================================
 * REJECT APPROVED-LEAVE CANCELLATION
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancellation/reject
 *
 * Managerial action.
 */
router.post(
  "/:leaveRequestId/cancellation/reject",
  authorize(PERMISSIONS.LEAVE_REJECT),
  validate(rejectLeaveCancellationSchema),
  rejectLeaveCancellation,
);

/**
 * ============================================================
 * GET LEAVE REQUEST BY ID
 * ============================================================
 *
 * GET
 * /companies/:companyId/leave/requests/:leaveRequestId
 *
 * IMPORTANT:
 * Keep this after workflow routes.
 */
router.get(
  "/:leaveRequestId",
  authorize(PERMISSIONS.LEAVE_READ),
  validate(getLeaveRequestSchema),
  getLeave,
);

export default router;
