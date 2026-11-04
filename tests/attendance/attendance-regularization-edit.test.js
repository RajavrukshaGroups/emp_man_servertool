import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";
import AttendancePolicy from "../../src/modules/attendance/attendancePolicy.model.js";
import AttendanceRegularization from "../../src/modules/attendance/attendanceRegularization.model.js";

import "../../src/modules/users/user.model.js";
import "../../src/modules/departments/department.model.js";
import "../../src/modules/teams/team.model.js";
import "../../src/modules/roles/role.model.js";
import "../../src/modules/attendance/attendanceLocation.model.js";

import { updateAttendanceRegularization } from "../../src/modules/attendance/attendanceRegularization.service.js";

describe("Attendance regularization editing", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    await mongoose.connect(replicaSet.getUri());
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet.stop();
  }, 30000);

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it("edits a pending checkout correction and preserves attendance", async () => {
    const userId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const shiftId = new mongoose.Types.ObjectId();

    const company = await Company.create({
      name: "Regularization Edit Test Company",
      code: "REGEDIT",
      slug: "regularization-edit-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId,
      roleId,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId,
      status: "ACTIVE",
    });

    const policy = await AttendancePolicy.create({
      companyId: company._id,
      name: "Regularization Test Policy",
      code: "REGEDIT",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      regularizationEnabled: true,
      regularizationWindowDays: 365,
      allowCheckOutCorrection: true,
    });

    const attendanceDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .reduce((parts, part) => {
        if (part.type !== "literal") parts[part.type] = part.value;
        return parts;
      }, {});

    const dateString = `${attendanceDate.year}-${attendanceDate.month}-${attendanceDate.day}`;
    const checkInAt = new Date(`${dateString}T04:00:00.000Z`);
    const actualCheckOutAt = new Date(`${dateString}T12:00:00.000Z`);
    const originalRequestedTime = new Date(`${dateString}T13:35:00.000Z`);
    const revisedRequestedTime = new Date(`${dateString}T14:40:00.000Z`);

    const attendance = await Attendance.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceDate: dateString,
      attendanceMode: "OFFICE",
      shiftId,
      attendancePolicyId: policy._id,
      shiftSnapshot: {
        name: "General Shift",
        code: "GENERAL",
        startTime: "09:30",
        endTime: "18:30",
        fullDayMinutes: 480,
        halfDayMinutes: 240,
      },
      workSessions: [
        {
          checkInAt,
          checkOutAt: actualCheckOutAt,
        },
      ],
    });

    const workSessionId = attendance.workSessions[0]._id;

    const regularization = await AttendanceRegularization.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceId: attendance._id,
      attendanceDate: dateString,
      requestType: "CHECKOUT_TIME_CORRECTION",
      targetWorkSessionId: workSessionId,
      requestedCheckOutAt: originalRequestedTime,
      originalCheckOutAt: actualCheckOutAt,
      reason: "Checkout time needs correction",
      status: "PENDING",
      createdBy: userId,
      updatedBy: userId,
    });

    // An approved request must not be editable.
    const approvedRegularization = await AttendanceRegularization.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceId: attendance._id,
      attendanceDate: dateString,
      requestType: "OTHER",
      reason: "Original approved correction reason",
      status: "APPROVED",
      approvedBy: userId,
      approvedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
    });

    await expect(
      updateAttendanceRegularization({
        companyId: company._id.toString(),
        regularizationId: approvedRegularization._id.toString(),
        data: {
          expectedRevision: 0,
          reason: "Attempting to modify an approved request",
        },
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "COMPANY",
          companyId: company._id,
          companyAccessId: companyAccess._id,
          userId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Only pending regularization requests can be edited.",
    });

    const unchangedApproved = await AttendanceRegularization.findById(
      approvedRegularization._id,
    );

    expect(unchangedApproved.reason).toBe(
      "Original approved correction reason",
    );
    expect(unchangedApproved.editHistory).toHaveLength(0);

    // Create another employee in the same company.
    const otherUserId = new mongoose.Types.ObjectId();

    const otherCompanyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: otherUserId,
      roleId: new mongoose.Types.ObjectId(),
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    const otherEmployee = await Employee.create({
      companyId: company._id,
      companyAccessId: otherCompanyAccess._id,
      userId: otherUserId,
      status: "ACTIVE",
    });

    // Employee B attempts to edit Employee A's pending request.
    await expect(
      updateAttendanceRegularization({
        companyId: company._id.toString(),
        regularizationId: regularization._id.toString(),
        data: {
          expectedRevision: 0,
          reason: "Unauthorized modification by another employee",
        },
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "EMPLOYEE",
          companyId: company._id,
          companyAccessId: otherCompanyAccess._id,
          userId: otherUserId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Attendance regularization request not found.",
    });

    // Verify the original request was not modified.
    const unchangedRequest = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(unchangedRequest.reason).toBe("Checkout time needs correction");
    expect(unchangedRequest.editHistory).toHaveLength(0);

    // A requested checkout cannot be earlier than check-in.
    const invalidCheckOutAt = new Date(checkInAt.getTime() - 30 * 60 * 1000);

    await expect(
      updateAttendanceRegularization({
        companyId: company._id.toString(),
        regularizationId: regularization._id.toString(),
        data: {
          expectedRevision: 0,
          requestedCheckOutAt: invalidCheckOutAt.toISOString(),
        },
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "EMPLOYEE",
          companyId: company._id,
          companyAccessId: companyAccess._id,
          userId,
        },
      }),
    ).rejects.toThrow();

    const afterInvalidEdit = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(afterInvalidEdit.requestedCheckOutAt.toISOString()).toBe(
      originalRequestedTime.toISOString(),
    );
    expect(afterInvalidEdit.editHistory).toHaveLength(0);

    // Reject an edit that does not change any existing values.
    await expect(
      updateAttendanceRegularization({
        companyId: company._id.toString(),
        regularizationId: regularization._id.toString(),
        data: {
          expectedRevision: 0,
          requestedCheckOutAt: originalRequestedTime.toISOString(),
          reason: "Checkout time needs correction",
        },
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "EMPLOYEE",
          companyId: company._id,
          companyAccessId: companyAccess._id,
          userId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "No changes were detected in the regularization request.",
    });

    const afterNoChangeEdit = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(afterNoChangeEdit.editHistory).toHaveLength(0);
    expect(afterNoChangeEdit.reason).toBe("Checkout time needs correction");

    const updated = await updateAttendanceRegularization({
      companyId: company._id.toString(),
      regularizationId: regularization._id.toString(),
      data: {
        expectedRevision: 0,
        requestedCheckOutAt: revisedRequestedTime.toISOString(),
        reason: "Corrected checkout time after reviewing records",
      },
      requesterContext: {
        accessType: "COMPANY",
        roleScopeType: "COMPANY",
        companyId: company._id,
        companyAccessId: companyAccess._id,
        userId,
      },
    });

    expect(updated._id.toString()).toBe(regularization._id.toString());
    expect(updated.status).toBe("PENDING");
    expect(updated.requestedCheckOutAt.toISOString()).toBe(
      revisedRequestedTime.toISOString(),
    );

    const saved = await AttendanceRegularization.findById(regularization._id);
    expect(saved.editHistory).toHaveLength(1);
    expect(saved.editHistory[0].editedBy.toString()).toBe(userId.toString());
    expect(
      saved.editHistory[0].previousValues.requestedCheckOutAt.toISOString(),
    ).toBe(originalRequestedTime.toISOString());
    expect(
      saved.editHistory[0].newValues.requestedCheckOutAt.toISOString(),
    ).toBe(revisedRequestedTime.toISOString());
    expect(saved.originalCheckOutAt.toISOString()).toBe(
      actualCheckOutAt.toISOString(),
    );

    // First successful edit must increment the revision.
    expect(updated.editRevision).toBe(1);
    expect(saved.editRevision).toBe(1);

    // Simulate another browser tab submitting an outdated revision.
    await expect(
      updateAttendanceRegularization({
        companyId: company._id.toString(),
        regularizationId: regularization._id.toString(),
        data: {
          expectedRevision: 0,
          requestedCheckOutAt: originalRequestedTime.toISOString(),
          reason: "Outdated edit from another browser tab",
        },
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "EMPLOYEE",
          companyId: company._id,
          companyAccessId: companyAccess._id,
          userId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "This regularization request was modified by another session. Please refresh and try again.",
    });

    // A rejected stale edit must not modify the request or audit history.
    const afterStaleEdit = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(afterStaleEdit.editRevision).toBe(1);
    expect(afterStaleEdit.editHistory).toHaveLength(1);
    expect(afterStaleEdit.requestedCheckOutAt.toISOString()).toBe(
      revisedRequestedTime.toISOString(),
    );
    expect(afterStaleEdit.reason).toBe(
      "Corrected checkout time after reviewing records",
    );

    const unchangedAttendance = await Attendance.findById(attendance._id);
    expect(unchangedAttendance.workSessions[0].checkOutAt.toISOString()).toBe(
      actualCheckOutAt.toISOString(),
    );
  });

  it("rejects editing an approved regularization request", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const companyAccessId = new mongoose.Types.ObjectId();
    const employeeId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const regularization = await AttendanceRegularization.create({
      companyId,
      companyAccessId,
      employeeId,
      attendanceId: new mongoose.Types.ObjectId(),
      attendanceDate: "2026-11-02",
      requestType: "OTHER",
      reason: "Original attendance correction reason",
      status: "APPROVED",
      approvedBy: userId,
      approvedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
    });

    await expect(
      updateAttendanceRegularization({
        companyId: companyId.toString(),
        regularizationId: regularization._id.toString(),
        data: {
          expectedRevision: 0,
          reason: "Trying to edit an approved request",
        },
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "COMPANY",
          companyId,
          companyAccessId,
          userId,
        },
      }),
    ).rejects.toThrow();

    const unchanged = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(unchanged.status).toBe("APPROVED");
    expect(unchanged.reason).toBe("Original attendance correction reason");
    expect(unchanged.editHistory).toHaveLength(0);
  });
});
