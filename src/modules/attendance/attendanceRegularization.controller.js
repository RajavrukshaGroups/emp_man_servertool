import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

import {
  createAttendanceRegularization,
  getMyAttendanceRegularizations,
  listAttendanceRegularizations,
  getAttendanceRegularizationById,
  recommendAttendanceRegularization,
  approveAttendanceRegularization,
  rejectAttendanceRegularization,
  cancelAttendanceRegularization,
} from "./attendanceRegularization.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

/**
 * ============================================================
 * CREATE ATTENDANCE REGULARIZATION
 * ============================================================
 *
 * Employee self-service only.
 *
 * Identity is derived from authentication inside the service.
 * The frontend must never decide employeeId/companyAccessId.
 */

export const createRegularization = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const regularization = await createAttendanceRegularization({
    companyId: req.validated.params.companyId,
    data: req.validated.body,
    requesterContext,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        regularization,
        "Attendance regularization request created successfully.",
      ),
    );
});

/**
 * ============================================================
 * MY ATTENDANCE REGULARIZATIONS
 * ============================================================
 *
 * Returns only the authenticated employee's requests.
 */

export const getMyRegularizations = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const result = await getMyAttendanceRegularizations({
    companyId: req.validated.params.companyId,
    query: req.validated.query || {},
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Attendance regularization requests fetched successfully.",
      ),
    );
});

/**
 * ============================================================
 * LIST ATTENDANCE REGULARIZATIONS
 * ============================================================
 *
 * Scope is enforced by attendanceRegularization.service.js.
 *
 * Examples:
 *
 * COMPANY    -> company requests
 * DEPARTMENT -> department requests
 * TEAM       -> managed teams + self
 */

export const listRegularizations = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const result = await listAttendanceRegularizations({
    companyId: req.validated.params.companyId,
    query: req.validated.query || {},
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        result,
        "Attendance regularization requests fetched successfully.",
      ),
    );
});

/**
 * ============================================================
 * GET ATTENDANCE REGULARIZATION BY ID
 * ============================================================
 */

export const getRegularizationById = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const regularization = await getAttendanceRegularizationById({
    companyId: req.validated.params.companyId,
    regularizationId: req.validated.params.regularizationId,
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        regularization,
        "Attendance regularization request fetched successfully.",
      ),
    );
});

/**
 * ============================================================
 * RECOMMEND ATTENDANCE REGULARIZATION
 * ============================================================
 *
 * Permission:
 * attendance.correction_recommend
 *
 * Scope:
 * enforced inside service through canManageCompanyAccess().
 */

export const recommendRegularization = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const regularization = await recommendAttendanceRegularization({
    companyId: req.validated.params.companyId,
    regularizationId: req.validated.params.regularizationId,
    data: req.validated.body,
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        regularization,
        "Attendance regularization request recommended successfully.",
      ),
    );
});

/**
 * ============================================================
 * APPROVE ATTENDANCE REGULARIZATION
 * ============================================================
 *
 * Permission:
 * attendance.correction_approve
 *
 * Approval also applies the correction to Attendance and
 * triggers attendance recalculation transactionally.
 */

export const approveRegularization = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const regularization = await approveAttendanceRegularization({
    companyId: req.validated.params.companyId,
    regularizationId: req.validated.params.regularizationId,
    data: req.validated.body,
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        regularization,
        "Attendance regularization request approved and applied successfully.",
      ),
    );
});

/**
 * ============================================================
 * REJECT ATTENDANCE REGULARIZATION
 * ============================================================
 *
 * Permission:
 * attendance.correction_approve
 *
 * Rejecting a request does not modify Attendance.
 */

export const rejectRegularization = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const regularization = await rejectAttendanceRegularization({
    companyId: req.validated.params.companyId,
    regularizationId: req.validated.params.regularizationId,
    data: req.validated.body,
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        regularization,
        "Attendance regularization request rejected successfully.",
      ),
    );
});

/**
 * ============================================================
 * CANCEL OWN ATTENDANCE REGULARIZATION
 * ============================================================
 *
 * Employee can cancel only their own pending request.
 */

export const cancelRegularization = asyncHandler(async (req, res) => {
  const requesterContext = getAttendanceRequesterContext(req);

  const regularization = await cancelAttendanceRegularization({
    companyId: req.validated.params.companyId,
    regularizationId: req.validated.params.regularizationId,
    data: req.validated.body,
    requesterContext,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        regularization,
        "Attendance regularization request cancelled successfully.",
      ),
    );
});
