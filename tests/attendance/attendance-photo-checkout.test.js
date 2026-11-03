import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import Shift from "../../src/modules/attendance/shift.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";
import AttendancePolicy from "../../src/modules/attendance/attendancePolicy.model.js";
import WorkCalendar from "../../src/modules/workCalendar/workCalendar.model.js";
import AttendancePhotoEvidence from "../../src/modules/attendance/attendancePhotoEvidence.model.js";

// Register models required by attendance.populate()
import "../../src/modules/users/user.model.js";
import "../../src/modules/departments/department.model.js";
import "../../src/modules/teams/team.model.js";
import "../../src/modules/roles/role.model.js";
import "../../src/modules/attendance/attendanceLocation.model.js";

import { checkOutAttendance } from "../../src/modules/attendance/attendance.service.js";
describe("Attendance photo check-out integration", () => {
  let replicaSet;

  const fixedTime = new Date("2026-10-30T12:00:00.000Z");

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet.stop();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await mongoose.connection.dropDatabase();
  });

  const createFixture = async () => {
    const userId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();

    const company = await Company.create({
      name: "Photo Checkout Test Company",
      code: "PCHK",
      slug: "photo-checkout-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const workCalendar = await WorkCalendar.create({
      companyId: company._id,
      name: "Standard Work Calendar",
      code: "STANDARD",
      description: "Monday to Saturday working schedule",
      weeklyOffDays: [0],
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      isDefault: true,
      status: "ACTIVE",
    });

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
      userId,
      companyId: company._id,
      roleId,
      shiftId: shift._id,
      status: "ACTIVE",
      attendanceMode: "OFFICE",

      attendanceLocationPolicy: {
        checkIn: "GEOFENCE_REQUIRED",
        checkOut: "NOT_REQUIRED",
      },
    });

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId,
      status: "ACTIVE",
    });

    const policy = await AttendancePolicy.create({
      companyId: company._id,
      name: "Standard Attendance Policy",
      code: "STANDARD",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      isDefault: true,
      status: "ACTIVE",
      photoCapture: {
        enabled: false,
      },
    });

    const attendance = await Attendance.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceDate: "2026-10-30",
      shiftId: shift._id,
      attendancePolicyId: policy._id,
      attendanceMode: "OFFICE",
      shiftSnapshot: {
        name: shift.name,
        code: shift.code,
        startTime: shift.startTime,
        endTime: shift.endTime,
        isOvernight: false,
        fullDayMinutes: 480,
        halfDayMinutes: 240,
      },
      workSessions: [
        {
          checkInAt: new Date("2026-10-30T03:30:00.000Z"),
          checkOutAt: null,
          status: "OPEN",
        },
      ],
    });

    const requesterContext = {
      accessType: "COMPANY",
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId,
    };

    return {
      company,
      companyAccess,
      employee,
      shift,
      policy,
      attendance,
      requesterContext,
    };
  };

  it("allows check-out without a photo when capture is disabled", async () => {
    const fixture = await createFixture();

    await checkOutAttendance({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {},
    });

    const updated = await Attendance.findById(fixture.attendance._id);

    expect(updated.workSessions[0].status).toBe("CLOSED");
    expect(updated.workSessions[0].checkOutAt).toBeTruthy();

    expect(updated.workSessions[0].checkOutPhotoEvidence.status).toBe(
      "NOT_REQUIRED",
    );
  });

  it("rejects check-out without a photo when capture is required", async () => {
    const fixture = await createFixture();

    // Enable mandatory check-out photo capture for OFFICE employees.
    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    // Employee attempts check-out without photoEvidenceId.
    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {},
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        "A check-out photograph is required by company attendance policy.",
    });

    // Confirm the failed transaction did not close the work session.
    const updated = await Attendance.findById(fixture.attendance._id);

    expect(updated).not.toBeNull();
    expect(updated.workSessions[0].status).toBe("OPEN");
    expect(updated.workSessions[0].checkOutAt).toBeNull();

    // No photograph should have been recorded.
    expect(updated.workSessions[0].checkOutPhotoEvidence?.status).not.toBe(
      "CAPTURED",
    );
  });

  it("consumes valid photo evidence during check-out", async () => {
    const fixture = await createFixture();

    // Enable mandatory check-out photo capture.
    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    // Identify the exact open work session.
    const workSessionId = fixture.attendance.workSessions[0]._id;

    expect(workSessionId).toBeTruthy();

    // Create valid pending photo evidence.
    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "CHECK_OUT",

      imagePublicId: "test/attendance/checkout-photo",
      imageAssetId: "test-checkout-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId,
      fieldVisitId: null,
    });

    // Check out using the photo evidence.
    await checkOutAttendance({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        photoEvidenceId: evidence._id.toString(),
      },
    });

    // Verify attendance session was closed.
    const updatedAttendance = await Attendance.findById(
      fixture.attendance._id,
    ).select(
      "+workSessions.checkOutPhotoEvidence.imagePublicId " +
        "+workSessions.checkOutPhotoEvidence.imageAssetId",
    );
    expect(updatedAttendance.workSessions[0].status).toBe("CLOSED");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeTruthy();

    // Verify captured photo metadata was attached.
    const photoEvidence =
      updatedAttendance.workSessions[0].checkOutPhotoEvidence;

    expect(photoEvidence.status).toBe("CAPTURED");
    expect(photoEvidence.imagePublicId).toBe("test/attendance/checkout-photo");
    expect(photoEvidence.imageAssetId).toBe("test-checkout-asset");

    // Verify evidence cannot be consumed again.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("CONSUMED");
    expect(updatedEvidence.consumedAt).toBeTruthy();
  });

  it("rejects expired check-out photo evidence without closing the session", async () => {
    const fixture = await createFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    const workSessionId = fixture.attendance.workSessions[0]._id;

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "CHECK_OUT",

      imagePublicId: "test/attendance/expired-photo",
      imageAssetId: "test-expired-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:55:00.000Z"),
      expiresAt: new Date("2026-10-30T11:57:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId,
      fieldVisitId: null,
    });

    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    // Verify the employee's work session is still open.
    const updatedAttendance = await Attendance.findById(fixture.attendance._id);

    expect(updatedAttendance.workSessions[0].status).toBe("OPEN");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeNull();

    // Verify expired evidence was not consumed.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeNull();
  });

  it("rejects already-consumed photo evidence without closing the session", async () => {
    const fixture = await createFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    const workSessionId = fixture.attendance.workSessions[0]._id;

    // Simulate a photograph that has already been consumed.
    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "CHECK_OUT",

      imagePublicId: "test/attendance/consumed-photo",
      imageAssetId: "test-consumed-asset",

      status: "CONSUMED",
      capturedAt: new Date("2026-10-30T11:58:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      consumedAt: new Date("2026-10-30T11:59:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId,
      fieldVisitId: null,
    });

    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    // The rejected request must not close the work session.
    const updatedAttendance = await Attendance.findById(fixture.attendance._id);

    expect(updatedAttendance.workSessions[0].status).toBe("OPEN");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeNull();

    // The existing evidence must remain consumed.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("CONSUMED");
    expect(updatedEvidence.consumedAt).toEqual(
      new Date("2026-10-30T11:59:00.000Z"),
    );
  });

  it("rejects photo evidence belonging to another employee", async () => {
    const fixture = await createFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    // Simulate a different employee's company access.
    const anotherEmployeeAccessId = new mongoose.Types.ObjectId();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,

      // Photo belongs to another employee.
      companyAccessId: anotherEmployeeAccessId,

      action: "CHECK_OUT",

      imagePublicId: "test/attendance/other-employee-photo",
      imageAssetId: "test-other-employee-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId: fixture.attendance.workSessions[0]._id,
      fieldVisitId: null,
    });

    // Employee attempts to use someone else's photo evidence.
    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    // Attendance must remain unchanged.
    const updatedAttendance = await Attendance.findById(fixture.attendance._id);

    expect(updatedAttendance.workSessions[0].status).toBe("OPEN");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeNull();

    // Another employee's photo must not be consumed.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeNull();
  });

  it("rejects photo evidence belonging to another company", async () => {
    const fixture = await createFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    // Simulate photo evidence belonging to another company.
    const anotherCompanyId = new mongoose.Types.ObjectId();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: anotherCompanyId,

      // Keep employee ownership the same to isolate company validation.
      companyAccessId: fixture.companyAccess._id,

      action: "CHECK_OUT",

      imagePublicId: "test/attendance/other-company-photo",
      imageAssetId: "test-other-company-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId: fixture.attendance.workSessions[0]._id,
      fieldVisitId: null,
    });

    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    // Check-out must not modify the employee's work session.
    const updatedAttendance = await Attendance.findById(fixture.attendance._id);

    expect(updatedAttendance.workSessions[0].status).toBe("OPEN");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeNull();

    // The other company's photo evidence must remain untouched.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeNull();
  });

  it("rejects photo evidence bound to a different work session", async () => {
    const fixture = await createFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    const actualWorkSessionId = fixture.attendance.workSessions[0]._id;
    const differentWorkSessionId = new mongoose.Types.ObjectId();

    expect(differentWorkSessionId.toString()).not.toBe(
      actualWorkSessionId.toString(),
    );

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "CHECK_OUT",

      imagePublicId: "test/attendance/wrong-session-photo",
      imageAssetId: "test-wrong-session-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),

      attendanceId: fixture.attendance._id,

      // Deliberately different from the currently open work session.
      workSessionId: differentWorkSessionId,

      fieldVisitId: null,
    });

    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    // Failed check-out must leave attendance unchanged.
    const updatedAttendance = await Attendance.findById(fixture.attendance._id);

    expect(updatedAttendance.workSessions[0].status).toBe("OPEN");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeNull();

    // The mismatched photograph must remain available only
    // for its originally associated session.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeNull();
  });
  it("rolls back photo consumption when check-out fails after consumption", async () => {
    const fixture = await createFixture();

    // Require check-out photo.
    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForCheckOut = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    const workSessionId = fixture.attendance.workSessions[0]._id;

    // Create valid photo evidence.
    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "CHECK_OUT",

      imagePublicId: "test/attendance/rollback-photo",
      imageAssetId: "test-rollback-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId,
      fieldVisitId: null,
    });

    // Deliberately cause a failure AFTER photo consumption.
    // A geofence is required, but no location is assigned.
    fixture.companyAccess.attendanceLocationPolicy.checkOut =
      "GEOFENCE_REQUIRED";

    fixture.companyAccess.attendanceLocationId = null;

    await fixture.companyAccess.save();

    await expect(
      checkOutAttendance({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "No attendance location has been assigned to this employee. Please contact the administrator.",
    });

    // Verify the photo-consumption update was rolled back.
    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeNull();

    // Verify the work session was not closed.
    const updatedAttendance = await Attendance.findById(fixture.attendance._id);

    expect(updatedAttendance.workSessions[0].status).toBe("OPEN");
    expect(updatedAttendance.workSessions[0].checkOutAt).toBeNull();

    expect(
      updatedAttendance.workSessions[0].checkOutPhotoEvidence?.status,
    ).not.toBe("CAPTURED");
  });
});
