import {
  approveLeaveCancellation as approveLeaveCancellationService,
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  getLeaveRequestById,
  listLeaveRequests,
  recommendLeaveRequest,
  rejectLeaveCancellation as rejectLeaveCancellationService,
  rejectLeaveRequest,
  requestApprovedLeaveCancellation,
} from "./leaveRequest.service.js";

import { getLeaveRequesterContext } from "./leave.scope.js";

/**
 * ============================================================
 * CREATE LEAVE REQUEST
 * ============================================================
 *
 * POST /companies/:companyId/leave/requests
 */
export const createLeave = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await createLeaveRequest({
      companyId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Leave request submitted successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST LEAVE REQUESTS
 * ============================================================
 *
 * GET /companies/:companyId/leave/requests
 */
export const listLeaves = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await listLeaveRequests({
      companyId,
      query: req.validated.query,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave requests fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET LEAVE REQUEST BY ID
 * ============================================================
 *
 * GET /companies/:companyId/leave/requests/:leaveRequestId
 */
export const getLeave = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await getLeaveRequestById({
      companyId,
      leaveRequestId,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave request fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * RECOMMEND LEAVE REQUEST
 * ============================================================
 *
 * POST /companies/:companyId/leave/requests/:leaveRequestId/recommend
 */
export const recommendLeave = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await recommendLeaveRequest({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave request recommended successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * APPROVE LEAVE REQUEST
 * ============================================================
 *
 * POST /companies/:companyId/leave/requests/:leaveRequestId/approve
 */
export const approveLeave = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await approveLeaveRequest({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave request approved successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * REJECT LEAVE REQUEST
 * ============================================================
 *
 * POST /companies/:companyId/leave/requests/:leaveRequestId/reject
 */
export const rejectLeave = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await rejectLeaveRequest({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave request rejected successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * CANCEL PENDING / RECOMMENDED LEAVE
 * ============================================================
 *
 * POST /companies/:companyId/leave/requests/:leaveRequestId/cancel
 */
export const cancelLeave = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await cancelLeaveRequest({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave request cancelled successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * REQUEST CANCELLATION OF APPROVED LEAVE
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancellation-request
 */
export const requestApprovedCancellation = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await requestApprovedLeaveCancellation({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Approved leave cancellation request submitted successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * APPROVE APPROVED-LEAVE CANCELLATION
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancellation/approve
 */
export const approveLeaveCancellation = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await approveLeaveCancellationService({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Approved leave cancellation approved successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * REJECT APPROVED-LEAVE CANCELLATION
 * ============================================================
 *
 * POST
 * /companies/:companyId/leave/requests/:leaveRequestId/cancellation/reject
 */
export const rejectLeaveCancellation = async (req, res, next) => {
  try {
    const { companyId, leaveRequestId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await rejectLeaveCancellationService({
      companyId,
      leaveRequestId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Approved leave cancellation rejected successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
