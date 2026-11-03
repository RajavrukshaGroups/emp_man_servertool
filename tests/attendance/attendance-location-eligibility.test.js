import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import app from "../../src/app.js";
import Company from "../../src/modules/companies/company.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import Shift from "../../src/modules/attendance/shift.model.js";
import AttendancePolicy from "../../src/modules/attendance/attendancePolicy.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";
import AttendanceLocation from "../../src/modules/attendance/attendanceLocation.model.js";
import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Attendance location eligibility HTTP integration", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    await mongoose.connect(replicaSet.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replicaSet) await replicaSet.stop();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  const createFixture = async () => {
    const company = await Company.create({
      name: "Location Eligibility Test Company",
      code: "LOCELIG",
      slug: "location-eligibility-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      code: "attendance.check_in",
      module: "attendance",
      action: "check_in",
      name: "Attendance Check In",
      status: "ACTIVE",
    });

    const role = await Role.create({
      companyId: company._id,
      name: "Employee",
      code: "EMPLOYEE",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Location",
      lastName: "Test Employee",
      email: "location.employee@example.com",
      password: "TestPassword@123",
      status: "ACTIVE",
      onboardingStatus: "COMPLETED",
    });

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordChangedAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
    );

    const shift = await Shift.create({
      companyId: company._id,
      name: "Day Shift",
      code: "DAY",
      startTime: "09:00",
      endTime: "18:00",
      isOvernight: false,
      fullDayMinutes: 480,
      halfDayMinutes: 240,
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      userId: user._id,
      companyId: company._id,
      roleId: role._id,
      shiftId: shift._id,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
      attendanceLocationPolicy: {
        checkIn: "NOT_REQUIRED",
        checkOut: "NOT_REQUIRED",
      },
    });

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId: user._id,
      status: "ACTIVE",
    });

    const attendancePolicy = await AttendancePolicy.create({
      companyId: company._id,
      name: "Location Eligibility Test Policy",
      code: "LOC_ELIG",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      isDefault: true,
      status: "ACTIVE",
    });

    const accessToken = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    return {
      company,
      accessToken,
      user,
      companyAccess,
      employee,
      shift,
      attendancePolicy,
    };
  };

  it("allows CHECK_IN without GPS when location is NOT_REQUIRED", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      eligible: true,
      action: "CHECK_IN",
      attendanceLocationPolicy: "NOT_REQUIRED",
    });

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_IN without GPS when policy is LOCATION_ONLY", async () => {
    const fixture = await createFixture();

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          "attendanceLocationPolicy.checkIn": "LOCATION_ONLY",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("allows CHECK_IN with valid GPS when policy is LOCATION_ONLY", async () => {
    const fixture = await createFixture();

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          "attendanceLocationPolicy.checkIn": "LOCATION_ONLY",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      eligible: true,
      action: "CHECK_IN",
      attendanceLocationPolicy: "LOCATION_ONLY",
    });

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_IN when GPS accuracy exceeds the policy limit", async () => {
    const fixture = await createFixture();

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          "attendanceLocationPolicy.checkIn": "LOCATION_ONLY",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 250,
          capturedAt: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("allows CHECK_IN when employee is inside assigned geofence", async () => {
    const fixture = await createFixture();

    const officeLocation = await AttendanceLocation.create({
      companyId: fixture.company._id,
      name: "Test Head Office",
      code: "TEST_HEAD_OFFICE",
      locationType: "OFFICE",
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceRadiusMeters: 100,
      allowCheckIn: true,
      allowCheckOut: true,
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          attendanceLocationId: officeLocation._id,
          "attendanceLocationPolicy.checkIn": "GEOFENCE_REQUIRED",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.data).toMatchObject({
      eligible: true,
      action: "CHECK_IN",
      attendanceLocationPolicy: "GEOFENCE_REQUIRED",
    });

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_IN when employee is outside assigned geofence", async () => {
    const fixture = await createFixture();

    const officeLocation = await AttendanceLocation.create({
      companyId: fixture.company._id,
      name: "Test Head Office",
      code: "TEST_HEAD_OFFICE",
      locationType: "OFFICE",
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceRadiusMeters: 100,
      allowCheckIn: true,
      allowCheckOut: true,
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          attendanceLocationId: officeLocation._id,
          "attendanceLocationPolicy.checkIn": "GEOFENCE_REQUIRED",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
        location: {
          // Deliberately far from the assigned office.
          latitude: 12.9816,
          longitude: 77.6046,
          accuracy: 15,
          capturedAt: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // The eligibility check must not create attendance records.
    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_IN when geofence is required but no location is assigned", async () => {
    const fixture = await createFixture();

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          "attendanceLocationPolicy.checkIn": "GEOFENCE_REQUIRED",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_IN when GPS evidence is stale", async () => {
    const fixture = await createFixture();

    await CompanyAccess.updateOne(
      { companyId: fixture.company._id },
      {
        $set: {
          "attendanceLocationPolicy.checkIn": "LOCATION_ONLY",
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_IN",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_OUT when employee has no active attendance session", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_OUT",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects CHECK_OUT when permitted employee has no open attendance", async () => {
    const fixture = await createFixture();

    // Grant the employee CHECK_OUT permission.
    const checkoutPermission = await Permission.create({
      code: "attendance.check_out",
      module: "attendance",
      action: "check_out",
      name: "Attendance Check Out",
      status: "ACTIVE",
    });

    await Role.updateOne(
      {
        companyId: fixture.company._id,
        code: "EMPLOYEE",
      },
      {
        $addToSet: {
          permissionIds: checkoutPermission._id,
        },
      },
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_OUT",
      });

    // Authorization succeeds, but no open attendance exists.
    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("rejects location eligibility requests without authentication", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .send({
        action: "CHECK_IN",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: new Date().toISOString(),
        },
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);

    expect(await Attendance.countDocuments()).toBe(0);
  });

  it("allows CHECK_OUT when employee has an open work session", async () => {
    const fixture = await createFixture();

    const checkoutPermission = await Permission.create({
      code: "attendance.check_out",
      module: "attendance",
      action: "check_out",
      name: "Attendance Check Out",
      status: "ACTIVE",
    });

    await Role.updateOne(
      {
        companyId: fixture.company._id,
        code: "EMPLOYEE",
      },
      {
        $addToSet: {
          permissionIds: checkoutPermission._id,
        },
      },
    );

    const checkInAt = new Date(Date.now() - 60 * 60 * 1000);

    const attendance = await Attendance.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      employeeId: fixture.employee._id,
      attendanceDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(checkInAt),
      shiftId: fixture.shift._id,
      attendancePolicyId: fixture.attendancePolicy._id,
      shiftSnapshot: {
        name: fixture.shift.name,
        code: fixture.shift.code,
        startTime: fixture.shift.startTime,
        endTime: fixture.shift.endTime,
        isOvernight: fixture.shift.isOvernight,
        fullDayMinutes: fixture.shift.fullDayMinutes,
        halfDayMinutes: fixture.shift.halfDayMinutes,
      },
      attendanceMode: "OFFICE",
      firstCheckInAt: checkInAt,
      workSessions: [
        {
          checkInAt,
          checkOutAt: null,
          status: "OPEN",
        },
      ],
      attendanceStatus: "PENDING",
      payrollStatus: "NOT_PROCESSED",
    });

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/location-eligibility`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        action: "CHECK_OUT",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      eligible: true,
      action: "CHECK_OUT",
      attendanceLocationPolicy: "NOT_REQUIRED",
    });

    // Eligibility must not perform checkout.
    const unchangedAttendance = await Attendance.findById(attendance._id);

    expect(unchangedAttendance.workSessions).toHaveLength(1);
    expect(unchangedAttendance.workSessions[0].status).toBe("OPEN");
    expect(unchangedAttendance.workSessions[0].checkOutAt).toBeNull();
  });
});
