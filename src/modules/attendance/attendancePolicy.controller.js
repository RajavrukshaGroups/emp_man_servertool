import {
  createAttendancePolicy,
  listAttendancePolicies,
  getAttendancePolicyById,
  updateAttendancePolicy,
} from "./attendancePolicy.service.js";

import { getAttendanceRequesterContext } from "./attendance.scope.js";

/**
 * ============================================================
 * CREATE POLICY
 * ============================================================
 */

export const createPolicy = async (req, res, next) => {
  try {
    const requesterContext = getAttendanceRequesterContext(req);

    const policy = await createAttendancePolicy({
      companyId: req.params.companyId,
      data: req.body,
      requesterContext,
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: "Attendance policy created successfully.",
      data: policy,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================================
 * LIST POLICIES
 * ============================================================
 */

export const listPolicies = async (req, res, next) => {
  try {
    const result = await listAttendancePolicies({
      companyId: req.params.companyId,
      query: req.query,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance policies fetched successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================================
 * GET POLICY
 * ============================================================
 */

export const getPolicy = async (req, res, next) => {
  try {
    const policy = await getAttendancePolicyById({
      companyId: req.params.companyId,
      policyId: req.params.policyId,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance policy fetched successfully.",
      data: policy,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * ============================================================
 * UPDATE POLICY
 * ============================================================
 */

export const updatePolicy = async (req, res, next) => {
  try {
    const requesterContext = getAttendanceRequesterContext(req);

    const policy = await updateAttendancePolicy({
      companyId: req.params.companyId,
      policyId: req.params.policyId,
      data: req.body,
      requesterContext,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: "Attendance policy updated successfully.",
      data: policy,
    });
  } catch (error) {
    next(error);
  }
};
