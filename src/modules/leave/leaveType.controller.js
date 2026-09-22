import {
  createLeaveType,
  getLeaveTypeById,
  listLeaveTypes,
  updateLeaveType,
} from "./leaveType.service.js";

import { getLeaveRequesterContext } from "./leave.scope.js";

/**
 * ============================================================
 * CREATE LEAVE TYPE
 * ============================================================
 *
 * POST /companies/:companyId/leave/types
 */
export const createType = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await createLeaveType({
      companyId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Leave type created successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST LEAVE TYPES
 * ============================================================
 *
 * GET /companies/:companyId/leave/types
 */
export const listTypes = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const data = await listLeaveTypes({
      companyId,
      query: req.validated.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave types fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET LEAVE TYPE BY ID
 * ============================================================
 *
 * GET /companies/:companyId/leave/types/:leaveTypeId
 */
export const getType = async (req, res, next) => {
  try {
    const { companyId, leaveTypeId } = req.validated.params;

    const data = await getLeaveTypeById({
      companyId,
      leaveTypeId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave type fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE LEAVE TYPE
 * ============================================================
 *
 * PATCH /companies/:companyId/leave/types/:leaveTypeId
 */
export const updateType = async (req, res, next) => {
  try {
    const { companyId, leaveTypeId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await updateLeaveType({
      companyId,
      leaveTypeId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave type updated successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
