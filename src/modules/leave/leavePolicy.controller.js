import {
  createLeavePolicy,
  getLeavePolicyById,
  listLeavePolicies,
  updateLeavePolicy,
} from "./leavePolicy.service.js";

import { getLeaveRequesterContext } from "./leave.scope.js";

/**
 * ============================================================
 * CREATE LEAVE POLICY
 * ============================================================
 *
 * POST /companies/:companyId/leave/policies
 */
export const createPolicy = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await createLeavePolicy({
      companyId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Leave policy created successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * LIST LEAVE POLICIES
 * ============================================================
 *
 * GET /companies/:companyId/leave/policies
 */
export const listPolicies = async (req, res, next) => {
  try {
    const { companyId } = req.validated.params;

    const data = await listLeavePolicies({
      companyId,
      query: req.validated.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave policies fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET LEAVE POLICY BY ID
 * ============================================================
 *
 * GET /companies/:companyId/leave/policies/:policyId
 */
export const getPolicy = async (req, res, next) => {
  try {
    const { companyId, policyId } = req.validated.params;

    const data = await getLeavePolicyById({
      companyId,
      policyId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave policy fetched successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE LEAVE POLICY
 * ============================================================
 *
 * PATCH /companies/:companyId/leave/policies/:policyId
 */
export const updatePolicy = async (req, res, next) => {
  try {
    const { companyId, policyId } = req.validated.params;

    const requesterContext = getLeaveRequesterContext(req);

    const data = await updateLeavePolicy({
      companyId,
      policyId,
      data: req.validated.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Leave policy updated successfully.",
      data,
    });
  } catch (error) {
    return next(error);
  }
};
