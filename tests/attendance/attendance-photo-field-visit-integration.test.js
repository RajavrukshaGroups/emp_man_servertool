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

import { checkInAttendance } from "../../src/modules/attendance/attendance.service.js";

import {
  startFieldVisit,
  endFieldVisit,
} from "../../src/modules/attendance/fieldVisit.service.js";

import FieldVisit from "../../src/modules/attendance/fieldVisit.model.js";
describe("Attendance photo field-visit integration", () => {
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
        checkIn: "NOT_REQUIRED",
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

  const createCheckedInFixture = async () => {
    const fixture = await createFixture();

    await checkInAttendance({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {},
    });

    const attendance = await Attendance.findOne({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      attendanceDate: "2026-10-30",
    });

    if (!attendance || attendance.workSessions.length === 0) {
      throw new Error("Failed to create an open attendance session");
    }

    return {
      ...fixture,
      attendance,
    };
  };

  it("starts a field visit without a photo when capture is disabled", async () => {
    const fixture = await createCheckedInFixture();

    const fieldVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: fixedTime.toISOString(),
        },
      },
    });

    expect(fieldVisit).toBeTruthy();

    const savedFieldVisit = await FieldVisit.findOne({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
    });

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.startPhotoEvidence?.status).not.toBe("CAPTURED");

    const evidenceCount = await AttendancePhotoEvidence.countDocuments({
      companyId: fixture.company._id,
    });

    expect(evidenceCount).toBe(0);
  });

  it("rejects field visit start without a photo when capture is required", async () => {
    const fixture = await createCheckedInFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitStart = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    await expect(
      startFieldVisit({
        companyId: fixture.company._id,
        requesterContext: fixture.requesterContext,
        data: {
          visitType: "CLIENT_VISIT",
          siteName: "Test Client Site",
          purpose: "Client project discussion",
          location: {
            latitude: 12.9716,
            longitude: 77.5946,
            accuracy: 15,
            capturedAt: fixedTime.toISOString(),
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    const fieldVisitCount = await FieldVisit.countDocuments({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
    });

    expect(fieldVisitCount).toBe(0);
  });

  it("consumes valid photo evidence when starting a field visit", async () => {
    const fixture = await createCheckedInFixture();

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitStart = true;
    fixture.policy.photoCapture.requireForOffice = true;

    await fixture.policy.save();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_START",

      imagePublicId: "test/attendance/field-visit-start-photo",
      imageAssetId: "test-field-visit-start-asset",

      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),

      attendanceId: fixture.attendance._id,
      workSessionId: fixture.attendance.workSessions[0]._id,
      fieldVisitId: null,
    });

    await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location: {
          latitude: 12.9716,
          longitude: 77.5946,
          accuracy: 15,
          capturedAt: fixedTime.toISOString(),
        },
        photoEvidenceId: evidence._id.toString(),
      },
    });

    const savedFieldVisit = await FieldVisit.findOne({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
    });

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("CONSUMED");
    expect(updatedEvidence.consumedAt).toBeTruthy();

    expect(updatedEvidence.fieldVisitId?.toString()).toBe(
      savedFieldVisit._id.toString(),
    );
  });

  it("ends a field visit without a photo when capture is disabled", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    const endedVisit = await endFieldVisit({
      companyId: fixture.company._id,
      fieldVisitId: startedVisit._id,
      requesterContext: fixture.requesterContext,
      data: {
        location,
        outcome: "Client discussion completed successfully",
        notes: "Meeting completed",
      },
    });

    expect(endedVisit).toBeTruthy();

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("COMPLETED");
    expect(savedFieldVisit.endedAt).toBeTruthy();
    expect(savedFieldVisit.endPhotoEvidence?.status).not.toBe("CAPTURED");

    const evidenceCount = await AttendancePhotoEvidence.countDocuments({
      companyId: fixture.company._id,
    });

    expect(evidenceCount).toBe(0);
  });

  it("rejects field visit end without a photo when capture is required", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    // Start the visit while photo capture is disabled.
    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    // Enable mandatory photo capture for ending field visits.
    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    await expect(
      endFieldVisit({
        companyId: fixture.company._id,
        fieldVisitId: startedVisit._id,
        requesterContext: fixture.requesterContext,
        data: {
          location,
          outcome: "Client discussion completed",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    // The failed request must not close the field visit.
    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();
  });

  it("consumes valid photo evidence when ending a field visit", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    // Start while photo capture is disabled.
    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    // Require a photograph for ending the visit.
    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/field-visit-end-photo",
      imageAssetId: "test-field-visit-end-asset",
      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      attendanceId: fixture.attendance._id,
      fieldVisitId: startedVisit._id,
    });

    await endFieldVisit({
      companyId: fixture.company._id,
      fieldVisitId: startedVisit._id,
      requesterContext: fixture.requesterContext,
      data: {
        location,
        outcome: "Client discussion completed successfully",
        photoEvidenceId: evidence._id.toString(),
      },
    });

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("COMPLETED");
    expect(savedFieldVisit.endedAt).toBeTruthy();
    expect(savedFieldVisit.endPhotoEvidence?.status).toBe("CAPTURED");

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("CONSUMED");
    expect(updatedEvidence.consumedAt).toBeTruthy();
    expect(updatedEvidence.fieldVisitId?.toString()).toBe(
      startedVisit._id.toString(),
    );
  });

  it("rejects expired field-visit end photo evidence without closing the visit", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/expired-field-visit-end-photo",
      imageAssetId: "test-expired-field-visit-end-asset",
      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:55:00.000Z"),
      expiresAt: new Date("2026-10-30T11:59:00.000Z"),
      attendanceId: fixture.attendance._id,
      fieldVisitId: startedVisit._id,
    });

    await expect(
      endFieldVisit({
        companyId: fixture.company._id,
        fieldVisitId: startedVisit._id,
        requesterContext: fixture.requesterContext,
        data: {
          location,
          outcome: "Client discussion completed",
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeFalsy();
  });

  it("rejects already-consumed field-visit end photo evidence without closing the visit", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    const previouslyConsumedAt = new Date("2026-10-30T11:59:30.000Z");

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/reused-field-visit-end-photo",
      imageAssetId: "test-reused-field-visit-end-asset",
      status: "CONSUMED",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      consumedAt: previouslyConsumedAt,
      attendanceId: fixture.attendance._id,
      fieldVisitId: startedVisit._id,
    });

    await expect(
      endFieldVisit({
        companyId: fixture.company._id,
        fieldVisitId: startedVisit._id,
        requesterContext: fixture.requesterContext,
        data: {
          location,
          outcome: "Client discussion completed",
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("CONSUMED");
    expect(updatedEvidence.consumedAt?.getTime()).toBe(
      previouslyConsumedAt.getTime(),
    );
  });

  it("rejects field-visit end photo evidence belonging to another employee", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    // Simulate evidence owned by a different employee.
    const anotherEmployeeAccessId = new mongoose.Types.ObjectId();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: anotherEmployeeAccessId,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/another-employee-field-visit-photo",
      imageAssetId: "test-another-employee-field-visit-asset",
      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      attendanceId: fixture.attendance._id,
      fieldVisitId: startedVisit._id,
    });

    await expect(
      endFieldVisit({
        companyId: fixture.company._id,
        fieldVisitId: startedVisit._id,
        requesterContext: fixture.requesterContext,
        data: {
          location,
          outcome: "Client discussion completed",
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeFalsy();
  });

  it("rejects field-visit end photo evidence belonging to another company", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    // Simulate photo evidence belonging to another company.
    const anotherCompanyId = new mongoose.Types.ObjectId();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: anotherCompanyId,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/another-company-field-visit-photo",
      imageAssetId: "test-another-company-field-visit-asset",
      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      attendanceId: fixture.attendance._id,
      fieldVisitId: startedVisit._id,
    });

    await expect(
      endFieldVisit({
        companyId: fixture.company._id,
        fieldVisitId: startedVisit._id,
        requesterContext: fixture.requesterContext,
        data: {
          location,
          outcome: "Client discussion completed",
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeFalsy();
  });

  it("rejects photo evidence bound to a different field visit", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    // The evidence is bound to a different field visit.
    const differentFieldVisitId = new mongoose.Types.ObjectId();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/wrong-field-visit-photo",
      imageAssetId: "test-wrong-field-visit-asset",
      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      attendanceId: fixture.attendance._id,
      fieldVisitId: differentFieldVisitId,
    });

    await expect(
      endFieldVisit({
        companyId: fixture.company._id,
        fieldVisitId: startedVisit._id,
        requesterContext: fixture.requesterContext,
        data: {
          location,
          outcome: "Client discussion completed",
          photoEvidenceId: evidence._id.toString(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeFalsy();
  });

  it("rolls back photo consumption when field-visit end fails after consumption", async () => {
    const fixture = await createCheckedInFixture();

    const location = {
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 15,
      capturedAt: fixedTime.toISOString(),
    };

    const startedVisit = await startFieldVisit({
      companyId: fixture.company._id,
      requesterContext: fixture.requesterContext,
      data: {
        visitType: "CLIENT_VISIT",
        siteName: "Test Client Site",
        purpose: "Client project discussion",
        location,
      },
    });

    fixture.policy.photoCapture.enabled = true;
    fixture.policy.photoCapture.requireForFieldVisitEnd = true;
    fixture.policy.photoCapture.requireForOffice = true;
    await fixture.policy.save();

    const evidence = await AttendancePhotoEvidence.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      action: "FIELD_VISIT_END",
      imagePublicId: "test/attendance/rollback-field-visit-end-photo",
      imageAssetId: "test-rollback-field-visit-end-asset",
      status: "PENDING",
      capturedAt: new Date("2026-10-30T11:59:00.000Z"),
      expiresAt: new Date("2026-10-30T12:01:00.000Z"),
      attendanceId: fixture.attendance._id,
      fieldVisitId: startedVisit._id,
    });

    // Simulate a database save failure after photo consumption.
    const originalSave = FieldVisit.prototype.save;

    const saveSpy = vi
      .spyOn(FieldVisit.prototype, "save")
      .mockImplementationOnce(async function () {
        throw new Error("Simulated field-visit save failure");
      });

    try {
      await expect(
        endFieldVisit({
          companyId: fixture.company._id,
          fieldVisitId: startedVisit._id,
          requesterContext: fixture.requesterContext,
          data: {
            location,
            outcome: "Client discussion completed",
            photoEvidenceId: evidence._id.toString(),
          },
        }),
      ).rejects.toThrow("Simulated field-visit save failure");
    } finally {
      saveSpy.mockRestore();
    }

    const savedFieldVisit = await FieldVisit.findById(startedVisit._id);

    expect(savedFieldVisit).not.toBeNull();
    expect(savedFieldVisit.status).toBe("IN_PROGRESS");
    expect(savedFieldVisit.endedAt).toBeNull();

    const updatedEvidence = await AttendancePhotoEvidence.findById(
      evidence._id,
    );

    expect(updatedEvidence).not.toBeNull();
    expect(updatedEvidence.status).toBe("PENDING");
    expect(updatedEvidence.consumedAt).toBeFalsy();
  });
});
