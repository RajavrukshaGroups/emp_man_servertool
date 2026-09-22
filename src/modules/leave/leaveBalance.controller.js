import {
  createLeaveBalance,
  listLeaveBalances,
  getLeaveBalanceById,
  getEmployeeLeaveBalances,
  adjustLeaveBalance,
  accrueMonthlyLeaveBalance,
  closeLeaveBalance,
} from "./leaveBalance.service.js";

import {
  getLeaveRequesterContext,
  buildReadableLeaveCompanyAccessFilter,
  canAccessLeaveCompanyAccess,
} from "./leave.scope.js";

import { ApiError } from "../../utils/ApiError.js";

export const initializeBalance = async (req, res) => {
  const requesterContext = await getLeaveRequesterContext(req);

  const balance = await createLeaveBalance({
    companyId: req.params.companyId,

    employeeId: req.body.employeeId,
    leaveTypeId: req.body.leaveTypeId,
    leavePolicyId: req.body.leavePolicyId,

    leaveYearStart: req.body.leaveYearStart,
    leaveYearEnd: req.body.leaveYearEnd,
    leaveYearLabel: req.body.leaveYearLabel,

    carriedForwardDays: req.body.carriedForwardDays ?? 0,

    requesterContext,
  });

  return res.status(201).json({
    success: true,
    statusCode: 201,
    message: "Leave balance initialized successfully.",
    data: balance,
  });
};

/**
 * ============================================================
 * LIST LEAVE BALANCES
 * ============================================================
 */
export const listBalances = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const scopeFilter = await buildReadableLeaveCompanyAccessFilter({
      companyId,
      requesterContext,
    });

    const data = await listLeaveBalances({
      companyId,
      query: req.validated.query,
      scopeFilter,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave balances fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET LEAVE BALANCE BY ID
 * ============================================================
 */
export const getBalance = async (req, res, next) => {
  try {
    const { companyId, balanceId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await getLeaveBalanceById({
      companyId,
      balanceId,
    });

    const allowed = await canAccessLeaveCompanyAccess({
      companyId,
      targetCompanyAccessId: data.companyAccessId?._id ?? data.companyAccessId,
      requesterContext,
    });

    if (!allowed) {
      throw new ApiError(
        403,
        "You do not have access to this employee's leave balance.",
      );
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave balance fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET EMPLOYEE LEAVE BALANCES
 * ============================================================
 */
export const getEmployeeBalances = async (req, res, next) => {
  try {
    const { companyId, employeeId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const balances = await getEmployeeLeaveBalances({
      companyId,
      employeeId,
      query: req.validated.query,
    });

    if (balances.length > 0) {
      const targetCompanyAccessId =
        balances[0].companyAccessId?._id ?? balances[0].companyAccessId;

      if (targetCompanyAccessId) {
        const allowed = await canAccessLeaveCompanyAccess({
          companyId,
          targetCompanyAccessId,
          requesterContext,
        });

        if (!allowed) {
          throw new ApiError(
            403,
            "You do not have access to this employee's leave balances.",
          );
        }
      }
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Employee leave balances fetched successfully.",
      data: balances,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * MANUAL BALANCE ADJUSTMENT
 * ============================================================
 */
export const adjustBalance = async (req, res, next) => {
  try {
    const { companyId, balanceId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await adjustLeaveBalance({
      companyId,
      balanceId,
      adjustmentDays: req.validated.body.adjustmentDays,
      reason: req.validated.body.reason,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave balance adjusted successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * MONTHLY ACCRUAL
 * ============================================================
 */
export const accrueBalance = async (req, res, next) => {
  try {
    const { companyId, balanceId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await accrueMonthlyLeaveBalance({
      companyId,
      balanceId,
      periodDate: req.validated.body.periodDate,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Monthly leave balance accrued successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CLOSE LEAVE BALANCE
 * ============================================================
 */
export const closeBalance = async (req, res, next) => {
  try {
    const { companyId, balanceId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await closeLeaveBalance({
      companyId,
      balanceId,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave balance closed successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
