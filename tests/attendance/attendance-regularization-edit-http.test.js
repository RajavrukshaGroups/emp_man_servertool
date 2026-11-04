import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import app from "../../src/app.js";

import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";

import Permission from "../../src/modules/permissions/permission.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";
import AttendancePolicy from "../../src/modules/attendance/attendancePolicy.model.js";
import AttendanceRegularization from "../../src/modules/attendance/attendanceRegularization.model.js";

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Attendance regularization editing HTTP security", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet?.stop();
  });

  it("rejects editing without an access token", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const regularizationId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(
        `/api/v1/companies/${companyId}/attendance/regularizations/${regularizationId}`,
      )
      .send({
        expectedRevision: 0,
        reason: "Updated attendance correction reason",
      });

    expect(response.status).toBe(401);
  });

  it("rejects editing with an invalid access token", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const regularizationId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(
        `/api/v1/companies/${companyId}/attendance/regularizations/${regularizationId}`,
      )
      .set("Authorization", "Bearer invalid.jwt.token")
      .send({
        expectedRevision: 0,
        reason: "Updated attendance correction reason",
      });

    expect(response.status).toBe(401);
  });

  it("rejects authenticated employees without correction request permission", async () => {
    const company = await Company.create({
      name: "Regularization HTTP Security Company",
      code: "RHSC",
      slug: "regularization-http-security",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Regularization",
      lastName: "Tester",
      email: "regularization-http-security@example.com",
      password: "TestPassword@123",
      status: "ACTIVE",
    });

    await User.collection.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    );

    const role = await Role.create({
      companyId: company._id,
      name: "Restricted Employee",
      code: "REGULARIZATION_RESTRICTED",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: user._id,
      roleId: role._id,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    const regularizationId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(
        `/api/v1/companies/${company._id}/attendance/regularizations/${regularizationId}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedRevision: 0,
        reason: "Trying to update an attendance correction",
      });

    expect(response.status).toBe(403);
  });

  it("allows an authorized employee to edit their own pending checkout correction", async () => {
    const company = await Company.create({
      name: "Regularization HTTP Edit Company",
      code: "RHEC",
      slug: "regularization-http-edit",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Regularization",
      lastName: "Employee",
      email: "regularization-edit-http@example.com",
      password: "TestPassword@123",
      status: "ACTIVE",
    });

    await User.collection.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    );

    const permission = await Permission.create({
      code: "attendance.correction_request",
      module: "attendance",
      action: "correction_request",
      name: "Request Attendance Correction",
      status: "ACTIVE",
    });

    const role = await Role.create({
      companyId: company._id,
      name: "Regularization Employee",
      code: "REGULARIZATION_EMPLOYEE",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: user._id,
      roleId: role._id,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId: user._id,
      status: "ACTIVE",
    });

    const policy = await AttendancePolicy.create({
      companyId: company._id,
      name: "HTTP Regularization Policy",
      code: "HTTPREG",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      regularizationEnabled: true,
      regularizationWindowDays: 365,
      allowCheckOutCorrection: true,
    });

    const dateParts = new Intl.DateTimeFormat("en-CA", {
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

    const dateString = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

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
      shiftId: new mongoose.Types.ObjectId(),
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

    const regularization = await AttendanceRegularization.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceId: attendance._id,
      attendanceDate: dateString,
      requestType: "CHECKOUT_TIME_CORRECTION",
      targetWorkSessionId: attendance.workSessions[0]._id,
      requestedCheckOutAt: originalRequestedTime,
      originalCheckOutAt: actualCheckOutAt,
      reason: "Checkout time needs correction",
      status: "PENDING",
      createdBy: user._id,
      updatedBy: user._id,
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    const endpoint =
      `/api/v1/companies/${company._id}` +
      `/attendance/regularizations/${regularization._id}`;

    // 1. Employee successfully edits their own pending request.
    const response = await request(app)
      .patch(endpoint)
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedRevision: 0,
        requestedCheckOutAt: revisedRequestedTime.toISOString(),
        reason: "Corrected checkout time after reviewing records",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const saved = await AttendanceRegularization.findById(regularization._id);

    expect(saved.status).toBe("PENDING");
    expect(saved.editRevision).toBe(1);
    expect(saved.editHistory).toHaveLength(1);
    expect(saved.editHistory[0].editedBy.toString()).toBe(user._id.toString());

    expect(saved.requestedCheckOutAt.toISOString()).toBe(
      revisedRequestedTime.toISOString(),
    );

    expect(
      saved.editHistory[0].previousValues.requestedCheckOutAt.toISOString(),
    ).toBe(originalRequestedTime.toISOString());

    expect(
      saved.editHistory[0].newValues.requestedCheckOutAt.toISOString(),
    ).toBe(revisedRequestedTime.toISOString());

    // Editing a request must not modify actual attendance.
    const unchangedAttendance = await Attendance.findById(attendance._id);

    expect(unchangedAttendance.workSessions[0].checkOutAt.toISOString()).toBe(
      actualCheckOutAt.toISOString(),
    );

    // 2. An outdated revision must be rejected.
    const staleResponse = await request(app)
      .patch(endpoint)
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedRevision: 0,
        reason: "Outdated edit from another browser tab",
      });

    expect(staleResponse.status).toBe(409);

    const afterStaleEdit = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(afterStaleEdit.editRevision).toBe(1);
    expect(afterStaleEdit.editHistory).toHaveLength(1);
    expect(afterStaleEdit.reason).toBe(
      "Corrected checkout time after reviewing records",
    );

    // 3. Another employee in the same company cannot edit this request.
    const otherUser = await User.create({
      firstName: "Other",
      lastName: "Employee",
      email: "other-regularization-http@example.com",
      password: "TestPassword@123",
      status: "ACTIVE",
    });

    await User.collection.updateOne(
      { _id: otherUser._id },
      {
        $set: {
          passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
    );

    const otherCompanyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: otherUser._id,
      roleId: role._id,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    await Employee.create({
      companyId: company._id,
      companyAccessId: otherCompanyAccess._id,
      userId: otherUser._id,
      status: "ACTIVE",
    });

    const otherToken = generateAccessToken({
      userId: otherUser._id,
      accessType: "COMPANY",
      companyAccessId: otherCompanyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    const unauthorizedResponse = await request(app)
      .patch(endpoint)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({
        expectedRevision: 1,
        reason: "Attempting to edit another employee's request",
      });

    expect(unauthorizedResponse.status).toBe(404);

    const afterUnauthorizedEdit = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(afterUnauthorizedEdit.editRevision).toBe(1);
    expect(afterUnauthorizedEdit.editHistory).toHaveLength(1);
    expect(afterUnauthorizedEdit.reason).toBe(
      "Corrected checkout time after reviewing records",
    );

    // 4. Once approved, the request must no longer be editable.
    // Change the status only in the isolated test database.
    await AttendanceRegularization.updateOne(
      { _id: regularization._id },
      {
        $set: {
          status: "APPROVED",
          approvedBy: user._id,
          approvedAt: new Date(),
        },
      },
    );

    const approvedEditResponse = await request(app)
      .patch(endpoint)
      .set("Authorization", `Bearer ${token}`)
      .send({
        expectedRevision: 1,
        reason: "Trying to modify an approved attendance correction",
      });

    expect(approvedEditResponse.status).toBe(409);

    const afterApprovedEdit = await AttendanceRegularization.findById(
      regularization._id,
    );

    expect(afterApprovedEdit.status).toBe("APPROVED");
    expect(afterApprovedEdit.editRevision).toBe(1);
    expect(afterApprovedEdit.editHistory).toHaveLength(1);
    expect(afterApprovedEdit.reason).toBe(
      "Corrected checkout time after reviewing records",
    );
  });
});
