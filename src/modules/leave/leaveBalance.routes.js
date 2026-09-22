import express from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { enforceCompanyContext } from "../../middlewares/enforceCompanyContext.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  initializeLeaveBalanceSchema,
  listLeaveBalancesSchema,
  getLeaveBalanceSchema,
  getEmployeeLeaveBalancesSchema,
  adjustLeaveBalanceSchema,
  accrueMonthlyLeaveBalanceSchema,
  closeLeaveBalanceSchema,
} from "./leave.validation.js";

import {
  initializeBalance,
  listBalances,
  getBalance,
  getEmployeeBalances,
  adjustBalance,
  accrueBalance,
  closeBalance,
} from "./leaveBalance.controller.js";

const router = express.Router({
  mergeParams: true,
});

/**
 * ============================================================
 * LEAVE BALANCE ROUTES
 * ============================================================
 *
 * Mounted at:
 *
 * /companies/:companyId/leave/balances
 */

router.use(authenticate, enforceCompanyContext);

/**
 * ============================================================
 * LIST LEAVE BALANCES
 * ============================================================
 */
router.get(
  "/",
  authorize(PERMISSIONS.LEAVE_BALANCE_READ),
  validate(listLeaveBalancesSchema),
  listBalances,
);

/**
 * ============================================================
 * GET EMPLOYEE LEAVE BALANCES
 * ============================================================
 *
 * Keep this route before /:balanceId.
 */
router.get(
  "/employee/:employeeId",
  authorize(PERMISSIONS.LEAVE_BALANCE_READ),
  validate(getEmployeeLeaveBalancesSchema),
  getEmployeeBalances,
);

router.post(
  "/initialize",
  authorize(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  validate(initializeLeaveBalanceSchema),
  initializeBalance,
);

/**
 * ============================================================
 * MANUAL BALANCE ADJUSTMENT
 * ============================================================
 */
router.patch(
  "/:balanceId/adjust",
  authorize(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  validate(adjustLeaveBalanceSchema),
  adjustBalance,
);

/**
 * ============================================================
 * MONTHLY ACCRUAL
 * ============================================================
 */
router.post(
  "/:balanceId/accrue",
  authorize(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  validate(accrueMonthlyLeaveBalanceSchema),
  accrueBalance,
);

/**
 * ============================================================
 * CLOSE LEAVE BALANCE
 * ============================================================
 */
router.post(
  "/:balanceId/close",
  authorize(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  validate(closeLeaveBalanceSchema),
  closeBalance,
);

/**
 * ============================================================
 * GET LEAVE BALANCE BY ID
 * ============================================================
 *
 * Keep generic /:balanceId after named balance operations.
 */
router.get(
  "/:balanceId",
  authorize(PERMISSIONS.LEAVE_BALANCE_READ),
  validate(getLeaveBalanceSchema),
  getBalance,
);

export default router;
