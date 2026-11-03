import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Shift from "./shift.model.js";
import Attendance from "./attendance.model.js";
import FieldVisit from "./fieldVisit.model.js";
import Employee from "../employees/employee.model.js";
import { isAttendancePhotoRequired } from "./attendancePhotoPolicy.helper.js";

import { ApiError } from "../../utils/ApiError.js";

import { getSelfAttendanceIdentity } from "./attendance.scope.js";

import AttendancePolicy from "./attendancePolicy.model.js";
import AttendancePhotoEvidence from "./attendancePhotoEvidence.model.js";

import {
  resolveActiveAttendancePolicy,
  resolveAttendancePolicyById,
  resolveAssignedShift,
  resolveCheckInAttendanceDate,
  findActionableOpenAttendance,
  resolveAttendanceCompany,
} from "./attendance.service.js";

import {
  getAttendanceDateInTimezone,
  resolveShiftAttendanceDate,
  addDaysToDateString,
  getShiftBoundaries,
} from "./attendance.utils.js";

import {
  uploadAttendancePhoto,
  deleteAttendancePhoto,
} from "./attendanceFaceStorage.service.js";

/**
 * ============================================================
 * PHOTO EVIDENCE CONSTANTS
 * ============================================================
 */

export const PHOTO_EVIDENCE_EXPIRY_MS = 2 * 60 * 1000;

/**
 * ============================================================
 * RESOLVE PHOTO CAPTURE CONTEXT
 * ============================================================
 *
 * Validates:
 * - Authenticated employee identity
 * - Active employee profile
 * - Attendance ownership
 * - Work-session state
 * - Field-visit ownership and state
 *
 * No Cloudinary uploads or database writes occur here.
 */

export const resolvePhotoCaptureContext = async ({
  companyId,
  requesterContext,
  action,
  attendanceId = null,
  fieldVisitId = null,
}) => {
  const identity = getSelfAttendanceIdentity({
    requesterContext,
    companyId,
  });

  const companyAccess = await CompanyAccess.findOne({
    _id: identity.companyAccessId,
    companyId,
    userId: identity.userId,
    status: "ACTIVE",
    isDeleted: false,
  }).select("_id companyId userId attendanceMode shiftId status");

  if (!companyAccess) {
    throw new ApiError(
      403,
      "Active company access is required for attendance photo capture.",
    );
  }

  const employee = await Employee.findOne({
    companyId,
    companyAccessId: identity.companyAccessId,
    status: "ACTIVE",
    isDeleted: false,
  });

  if (!employee) {
    throw new ApiError(
      403,
      "An active employee profile is required for photo capture.",
    );
  }

  const supportedActions = [
    "CHECK_IN",
    "CHECK_OUT",
    "FIELD_VISIT_START",
    "FIELD_VISIT_END",
  ];

  if (!supportedActions.includes(action)) {
    throw new ApiError(400, "Unsupported attendance photo action.");
  }

  /**
   * CHECK_IN:
   *
   * A new attendance record or work session may not exist yet.
   * We must still prevent capture when an open session exists.
   */

  if (action === "CHECK_IN") {
    const currentTime = new Date();

    const company = await resolveAttendanceCompany(companyId);
    const timezone = company.timezone || "Asia/Kolkata";

    const policy = await resolveActiveAttendancePolicy({
      companyId,
      currentTime,
    });

    const shift = await resolveAssignedShift({
      companyId,
      companyAccess,
      currentTime,
    });

    const attendanceDate = await resolveCheckInAttendanceDate({
      companyId,
      companyAccessId: identity.companyAccessId,
      currentTime,
      shift,
      timezone,
    });

    // A work session for this logical attendance date
    // must not already be open.
    const currentDayOpenAttendance = await Attendance.findOne({
      companyId,
      companyAccessId: identity.companyAccessId,
      attendanceDate,
      isDeleted: false,
      workSessions: {
        $elemMatch: {
          status: "OPEN",
          checkOutAt: null,
        },
      },
    });

    if (currentDayOpenAttendance) {
      throw new ApiError(
        409,
        "You already have an active attendance session for today.",
      );
    }

    // Older open sessions are governed by company policy.
    // Do not modify historical attendance during photo capture.
    const previousOpenAttendance = await Attendance.findOne({
      companyId,
      companyAccessId: identity.companyAccessId,
      attendanceDate: { $lt: attendanceDate },
      isDeleted: false,
      workSessions: {
        $elemMatch: {
          status: "OPEN",
          checkOutAt: null,
        },
      },
    });

    if (
      previousOpenAttendance &&
      !policy.allowNextDayCheckInWithPendingPreviousDay
    ) {
      throw new ApiError(
        409,
        "A previous attendance session is still open. Please regularize or complete the previous attendance before checking in again.",
      );
    }

    return {
      identity,
      companyAccess,
      employeeId: employee._id,
      attendanceId: null,
      workSessionId: null,
      fieldVisitId: null,
      attendanceDate,
    };
  }

  /**
   * CHECK_OUT and FIELD_VISIT_START:
   *
   * Both require an open work session.
   */
  if (action === "CHECK_OUT" || action === "FIELD_VISIT_START") {
    const company = await resolveAttendanceCompany(companyId);

    const attendance = await findActionableOpenAttendance({
      companyId,
      companyAccessId: identity.companyAccessId,
      currentTime: new Date(),
      timezone: company.timezone || "Asia/Kolkata",
    });

    if (!attendance) {
      throw new ApiError(
        409,
        "An open attendance session is required for this photo action.",
      );
    }

    if (attendanceId && String(attendance._id) !== String(attendanceId)) {
      throw new ApiError(
        403,
        "The attendance record does not belong to your active session.",
      );
    }

    const openSession = attendance.workSessions.find(
      (session) => session.status === "OPEN" && !session.checkOutAt,
    );

    if (!openSession) {
      throw new ApiError(409, "An open work session was not found.");
    }

    if (action === "FIELD_VISIT_START") {
      const activeBreak = attendance.breaks?.some(
        (item) => item.status === "ACTIVE" && !item.endedAt,
      );

      if (activeBreak) {
        throw new ApiError(
          409,
          "End your active break before starting a field visit.",
        );
      }

      const activeVisit = await FieldVisit.exists({
        companyId,
        companyAccessId: identity.companyAccessId,
        status: "IN_PROGRESS",
        isDeleted: false,
      });

      if (activeVisit) {
        throw new ApiError(409, "You already have an active field visit.");
      }
    }

    return {
      identity,
      companyAccess,
      employeeId: employee._id,
      attendanceId: attendance._id,
      workSessionId: openSession._id,
      fieldVisitId: null,
    };
  }

  /**
   * FIELD_VISIT_END:
   *
   * The visit must belong to the employee
   * and must still be in progress.
   */
  if (action === "FIELD_VISIT_END") {
    if (!fieldVisitId) {
      throw new ApiError(400, "Field visit ID is required.");
    }

    const fieldVisit = await FieldVisit.findOne({
      _id: fieldVisitId,
      companyId,
      companyAccessId: identity.companyAccessId,
      status: "IN_PROGRESS",
      isDeleted: false,
    });

    if (!fieldVisit) {
      throw new ApiError(404, "Active field visit was not found.");
    }

    return {
      identity,
      companyAccess,
      employeeId: employee._id,
      attendanceId: fieldVisit.attendanceId,
      workSessionId: null,
      fieldVisitId: fieldVisit._id,
    };
  }
};

/**
 * ============================================================
 * CREATE ATTENDANCE PHOTO EVIDENCE
 * ============================================================
 */

export const createAttendancePhotoEvidence = async ({
  companyId,
  requesterContext,
  action,
  attendanceId = null,
  fieldVisitId = null,
  imageBuffer,
}) => {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new ApiError(400, "A valid attendance photograph is required.");
  }

  const context = await resolvePhotoCaptureContext({
    companyId,
    requesterContext,
    action,
    attendanceId,
    fieldVisitId,
  });

  const { identity, companyAccess } = context;
  /**
   * Resolve the employee's current attendance mode.
   */

  const attendanceMode = companyAccess.attendanceMode || "OFFICE";
  if (!["OFFICE", "FIELD", "HYBRID", "REMOTE"].includes(attendanceMode)) {
    throw new ApiError(
      403,
      "A valid employee attendance mode is required for photo capture.",
    );
  }

  /**
   * Resolve the policy associated with the active attendance.
   *
   * For CHECK_IN, attendance may not exist yet.
   * Policy resolution for that action must be aligned with
   * the existing check-in policy resolver before enabling it.
   */
  let policy;

  if (action === "CHECK_IN") {
    policy = await resolveActiveAttendancePolicy({
      companyId,
      currentTime: new Date(),
    });
  } else {
    const attendance = await Attendance.findOne({
      _id: context.attendanceId,
      companyId,
      companyAccessId: identity.companyAccessId,
      isDeleted: false,
    });

    if (!attendance) {
      throw new ApiError(404, "Attendance record was not found.");
    }

    policy = await resolveAttendancePolicyById({
      companyId,
      policyId: attendance.attendancePolicyId,
    });
  }
  if (!policy?.photoCapture?.enabled) {
    throw new ApiError(
      403,
      "Attendance photo capture is disabled by company policy.",
    );
  }

  const photoRequired = isAttendancePhotoRequired({
    policy,
    action,
    attendanceMode,
  });

  if (!photoRequired) {
    throw new ApiError(
      403,
      "Photo capture is not required for this attendance action.",
    );
  }

  let uploadedImage = null;

  try {
    uploadedImage = await uploadAttendancePhoto({
      companyId,
      companyAccessId: identity.companyAccessId,
      action,
      imageBuffer,
    });

    const capturedAt = new Date();

    const expiresAt = new Date(capturedAt.getTime() + PHOTO_EVIDENCE_EXPIRY_MS);

    const evidence = await AttendancePhotoEvidence.create({
      companyId,
      companyAccessId: identity.companyAccessId,
      action,
      imagePublicId: uploadedImage.imagePublicId,
      imageAssetId: uploadedImage.imageAssetId,
      status: "PENDING",
      capturedAt,
      expiresAt,
      attendanceId: context.attendanceId,
      workSessionId: context.workSessionId,
      fieldVisitId: context.fieldVisitId,
    });

    return {
      evidenceId: evidence._id,
      action: evidence.action,
      capturedAt: evidence.capturedAt,
      expiresAt: evidence.expiresAt,
    };
  } catch (error) {
    if (uploadedImage?.imagePublicId) {
      try {
        await deleteAttendancePhoto({
          imagePublicId: uploadedImage.imagePublicId,
        });
      } catch (cleanupError) {
        console.error(
          "Failed to clean up attendance photo after evidence creation failure:",
          cleanupError,
        );
      }
    }

    throw error;
  }
};

/**
 * ============================================================
 * GET ATTENDANCE PHOTO REQUIREMENT
 * ============================================================
 *
 * Read-only policy check for the authenticated employee.
 * Uses the same context and policy resolution as photo upload.
 */
export const getAttendancePhotoRequirement = async ({
  companyId,
  requesterContext,
  action,
  attendanceId = null,
  fieldVisitId = null,
}) => {
  const context = await resolvePhotoCaptureContext({
    companyId,
    requesterContext,
    action,
    attendanceId,
    fieldVisitId,
  });

  const attendanceMode = context.companyAccess.attendanceMode || "OFFICE";

  if (!["OFFICE", "FIELD", "HYBRID", "REMOTE"].includes(attendanceMode)) {
    throw new ApiError(
      403,
      "A valid employee attendance mode is required for photo capture.",
    );
  }

  let policy;

  if (action === "CHECK_IN") {
    policy = await resolveActiveAttendancePolicy({
      companyId,
      currentTime: new Date(),
    });
  } else {
    const attendance = await Attendance.findOne({
      _id: context.attendanceId,
      companyId,
      companyAccessId: context.identity.companyAccessId,
      isDeleted: false,
    });

    if (!attendance) {
      throw new ApiError(404, "Attendance record was not found.");
    }

    policy = await resolveAttendancePolicyById({
      companyId,
      policyId: attendance.attendancePolicyId,
    });
  }

  return {
    action,
    attendanceMode,
    photoCaptureEnabled: policy?.photoCapture?.enabled === true,
    photoRequired: isAttendancePhotoRequired({
      policy,
      action,
      attendanceMode,
    }),
  };
};
