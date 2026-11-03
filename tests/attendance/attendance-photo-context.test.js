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
import { MongoMemoryServer } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import Shift from "../../src/modules/attendance/shift.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";
import AttendancePolicy from "../../src/modules/attendance/attendancePolicy.model.js";

import { resolvePhotoCaptureContext } from "../../src/modules/attendance/attendancePhotoEvidence.service.js";

describe("Attendance CHECK_IN photo capture context", () => {
  let mongoServer;

  const fixedTime = new Date("2026-10-31T04:00:00.000Z");

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await mongoose.connection.dropDatabase();
  });

  const createFixture = async ({ allowNextDayCheckIn = true } = {}) => {
    const userId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();

    const company = await Company.create({
      name: "Photo Context Test Company",
      code: "PCTX",
      slug: "photo-context-test",
      timezone: "Asia/Kolkata",
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
      effectiveTo: null,
      isDefault: true,
      status: "ACTIVE",
      allowNextDayCheckInWithPendingPreviousDay: allowNextDayCheckIn,
      photoCapture: {
        enabled: false,
      },
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
      requesterContext,
    };
  };

  const createOpenAttendance = async ({ fixture, attendanceDate }) => {
    return Attendance.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      employeeId: fixture.employee._id,
      attendanceDate,
      shiftId: fixture.shift._id,
      attendancePolicyId: fixture.policy._id,
      attendanceMode: "OFFICE",
      shiftSnapshot: {
        name: fixture.shift.name,
        code: fixture.shift.code,
        startTime: fixture.shift.startTime,
        endTime: fixture.shift.endTime,
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
  };

  it("allows photo context when yesterday's session is open and policy permits next-day check-in", async () => {
    const fixture = await createFixture({
      allowNextDayCheckIn: true,
    });

    const previousAttendance = await createOpenAttendance({
      fixture,
      attendanceDate: "2026-10-30",
    });

    const context = await resolvePhotoCaptureContext({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      action: "CHECK_IN",
    });

    expect(context.attendanceDate).toBe("2026-10-31");
    expect(String(context.employeeId)).toBe(String(fixture.employee._id));
    expect(context.attendanceId).toBeNull();

    const unchangedAttendance = await Attendance.findById(
      previousAttendance._id,
    );

    expect(unchangedAttendance.workSessions[0].status).toBe("OPEN");
    expect(
      unchangedAttendance.anomalies.some(
        (anomaly) => anomaly.type === "MISSING_CHECKOUT",
      ),
    ).toBe(false);
  });

  it("blocks photo context when yesterday's session is open and policy forbids next-day check-in", async () => {
    const fixture = await createFixture({
      allowNextDayCheckIn: false,
    });

    const previousAttendance = await createOpenAttendance({
      fixture,
      attendanceDate: "2026-10-30",
    });

    await expect(
      resolvePhotoCaptureContext({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        action: "CHECK_IN",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    // Photo-context validation must not modify historical attendance.
    const unchangedAttendance = await Attendance.findById(
      previousAttendance._id,
    );

    expect(unchangedAttendance.workSessions[0].status).toBe("OPEN");

    expect(
      unchangedAttendance.anomalies.some(
        (anomaly) => anomaly.type === "MISSING_CHECKOUT",
      ),
    ).toBe(false);
  });

  it("blocks CHECK_IN photo context when today's attendance already has an open session", async () => {
    const fixture = await createFixture({
      allowNextDayCheckIn: true,
    });

    const currentAttendance = await createOpenAttendance({
      fixture,
      attendanceDate: "2026-10-31",
    });

    await expect(
      resolvePhotoCaptureContext({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        action: "CHECK_IN",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const unchangedAttendance = await Attendance.findById(
      currentAttendance._id,
    );

    expect(unchangedAttendance.workSessions).toHaveLength(1);
    expect(unchangedAttendance.workSessions[0].status).toBe("OPEN");
    expect(unchangedAttendance.workSessions[0].checkOutAt).toBeNull();
  });

  it("rejects CHECK_IN photo context when the authenticated company does not match", async () => {
    const fixture = await createFixture();

    const anotherCompany = await Company.create({
      name: "Another Test Company",
      code: "PCTX2",
      slug: "another-photo-context-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    await expect(
      resolvePhotoCaptureContext({
        companyId: anotherCompany._id,
        requesterContext: fixture.requesterContext,
        action: "CHECK_IN",
      }),
    ).rejects.toThrow(
      "Attendance company context does not match authenticated company access.",
    );

    // The authenticated employee must remain associated
    // with the original company.
    const unchangedAccess = await CompanyAccess.findById(
      fixture.companyAccess._id,
    );

    expect(String(unchangedAccess.companyId)).toBe(String(fixture.company._id));

    expect(unchangedAccess.status).toBe("ACTIVE");
  });

  it("rejects CHECK_IN photo context when the employee company access is invalid", async () => {
    const fixture = await createFixture();

    const anotherCompanyAccessId = new mongoose.Types.ObjectId();

    const invalidRequesterContext = {
      ...fixture.requesterContext,
      companyAccessId: anotherCompanyAccessId,
    };

    await expect(
      resolvePhotoCaptureContext({
        companyId: fixture.company._id,
        requesterContext: invalidRequesterContext,
        action: "CHECK_IN",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    // The original employee's company access must remain unchanged.
    const originalAccess = await CompanyAccess.findById(
      fixture.companyAccess._id,
    );

    expect(originalAccess.status).toBe("ACTIVE");
    expect(String(originalAccess.userId)).toBe(
      String(fixture.requesterContext.userId),
    );
  });

  it("rejects CHECK_IN photo context when company access belongs to another user", async () => {
    const fixture = await createFixture();

    // Employee B belongs to the same company.
    const anotherUserId = new mongoose.Types.ObjectId();

    const anotherCompanyAccess = await CompanyAccess.create({
      userId: anotherUserId,
      companyId: fixture.company._id,
      roleId: new mongoose.Types.ObjectId(),
      shiftId: fixture.shift._id,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    await Employee.create({
      companyId: fixture.company._id,
      companyAccessId: anotherCompanyAccess._id,
      userId: anotherUserId,
      status: "ACTIVE",
    });

    // Employee A's userId is paired with Employee B's companyAccessId.
    const mismatchedRequesterContext = {
      ...fixture.requesterContext,
      companyAccessId: anotherCompanyAccess._id,
    };

    await expect(
      resolvePhotoCaptureContext({
        companyId: fixture.company._id,
        requesterContext: mismatchedRequesterContext,
        action: "CHECK_IN",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
