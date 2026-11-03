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

import request from "supertest";
import mongoose from "mongoose";
import sharp from "sharp";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const storageMocks = vi.hoisted(() => ({
  uploadAttendancePhoto: vi.fn(),
  deleteAttendancePhoto: vi.fn(),
}));

vi.mock(
  "../../src/modules/attendance/attendanceFaceStorage.service.js",
  () => ({
    uploadAttendancePhoto: storageMocks.uploadAttendancePhoto,
    deleteAttendancePhoto: storageMocks.deleteAttendancePhoto,
  }),
);

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
import AttendancePhotoEvidence from "../../src/modules/attendance/attendancePhotoEvidence.model.js";

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Attendance photo evidence HTTP integration", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();

    if (replicaSet) {
      await replicaSet.stop();
    }
  });

  beforeEach(() => {
    storageMocks.uploadAttendancePhoto.mockReset();
    storageMocks.deleteAttendancePhoto.mockReset();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
    vi.clearAllMocks();
  });

  const createTestUser = async () => {
    const user = await User.create({
      firstName: "Photo",
      lastName: "Test Employee",
      email: "photo.employee@example.com",
      password: "TestPassword@123",
      status: "ACTIVE",
      onboardingStatus: "COMPLETED",
    });

    // Ensure JWT issuance occurs after the last password change.
    // This only modifies the isolated test database.
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordChangedAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
    );

    return user;
  };

  const createAuthenticatedEmployeeFixture = async () => {
    const company = await Company.create({
      name: "Photo HTTP Test Company",
      code: "PHTTP",
      slug: "photo-http-test",
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

    const user = await createTestUser();

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

    const policy = await AttendancePolicy.create({
      companyId: company._id,
      name: "Photo HTTP Attendance Policy",
      code: "PHOTO_HTTP",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      isDefault: true,
      status: "ACTIVE",
      photoCapture: {
        enabled: true,
        requireForCheckIn: true,
        requireForOffice: true,
      },
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
      permission,
      role,
      user,
      shift,
      companyAccess,
      employee,
      policy,
      accessToken,
    };
  };

  it("rejects photo evidence uploads without authentication", async () => {
    const companyId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .post(`/api/v1/companies/${companyId}/attendance/photo-evidence`)
      .field("action", "CHECK_IN");

    expect(response.status).toBe(401);

    const evidenceCount = await AttendancePhotoEvidence.countDocuments();

    expect(evidenceCount).toBe(0);

    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });

  it("authenticates the employee and rejects a missing photo", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-evidence`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .field("action", "CHECK_IN");

    expect(response.status).toBe(400);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);

    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });

  it("uploads CHECK_IN photo evidence for an authenticated employee", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    const imageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: {
          r: 120,
          g: 160,
          b: 200,
        },
      },
    })
      .jpeg()
      .toBuffer();

    storageMocks.uploadAttendancePhoto.mockResolvedValue({
      imagePublicId: "attendance/test-photo-001",
      imageAssetId: "test-asset-001",
    });

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-evidence`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .field("action", "CHECK_IN")
      .attach("photo", imageBuffer, {
        filename: "check-in.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.action).toBe("CHECK_IN");
    expect(response.body.data.evidenceId).toBeDefined();

    expect(storageMocks.uploadAttendancePhoto).toHaveBeenCalledTimes(1);

    const evidence = await AttendancePhotoEvidence.findById(
      response.body.data.evidenceId,
    ).select("+imagePublicId +imageAssetId");

    expect(evidence).not.toBeNull();

    expect(String(evidence.companyId)).toBe(String(fixture.company._id));

    expect(String(evidence.companyAccessId)).toBe(
      String(fixture.companyAccess._id),
    );

    expect(evidence.action).toBe("CHECK_IN");
    expect(evidence.status).toBe("PENDING");

    expect(evidence.imagePublicId).toBe("attendance/test-photo-001");
    expect(evidence.imageAssetId).toBe("test-asset-001");

    const expiryDifference =
      evidence.expiresAt.getTime() - evidence.capturedAt.getTime();

    expect(expiryDifference).toBe(2 * 60 * 1000);

    expect(storageMocks.deleteAttendancePhoto).not.toHaveBeenCalled();
  });

  it("rejects photo uploads for another company", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    const otherCompanyId = new mongoose.Types.ObjectId();

    const imageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: {
          r: 120,
          g: 160,
          b: 200,
        },
      },
    })
      .jpeg()
      .toBuffer();

    const response = await request(app)
      .post(`/api/v1/companies/${otherCompanyId}/attendance/photo-evidence`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .field("action", "CHECK_IN")
      .attach("photo", imageBuffer, {
        filename: "check-in.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(403);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);

    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });

  it("rejects photo uploads without attendance check-in permission", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    // Remove the check-in permission from the employee's role.
    await Role.updateOne(
      { _id: fixture.role._id },
      {
        $set: {
          permissionIds: [],
        },
      },
    );

    const imageBuffer = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: {
          r: 120,
          g: 160,
          b: 200,
        },
      },
    })
      .jpeg()
      .toBuffer();

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-evidence`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .field("action", "CHECK_IN")
      .attach("photo", imageBuffer, {
        filename: "check-in.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(403);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);

    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });

  it("rejects unsupported photo file types", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    const invalidFileBuffer = Buffer.from(
      "This is not an attendance photograph.",
      "utf8",
    );

    const response = await request(app)
      .post(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-evidence`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .field("action", "CHECK_IN")
      .attach("photo", invalidFileBuffer, {
        filename: "invalid-photo.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);

    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
  it("returns mandatory CHECK_IN photo requirement for an OFFICE employee", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    const response = await request(app)
      .get(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-requirement`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .query({ action: "CHECK_IN" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      action: "CHECK_IN",
      attendanceMode: "OFFICE",
      photoCaptureEnabled: true,
      photoRequired: true,
    });

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);
    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
  it("returns photoRequired false when company photo capture is disabled", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    await AttendancePolicy.updateOne(
      { _id: fixture.policy._id },
      { $set: { "photoCapture.enabled": false } },
    );

    const response = await request(app)
      .get(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-requirement`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .query({ action: "CHECK_IN" });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      action: "CHECK_IN",
      attendanceMode: "OFFICE",
      photoCaptureEnabled: false,
      photoRequired: false,
    });

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);
    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
  it("rejects photo requirement requests for another company", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    const otherCompanyId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(`/api/v1/companies/${otherCompanyId}/attendance/photo-requirement`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .query({ action: "CHECK_IN" });

    expect(response.status).toBe(403);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);
    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
  it("rejects photo requirement requests without check-in permission", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    await Role.updateOne(
      { _id: fixture.role._id },
      { $set: { permissionIds: [] } },
    );

    const response = await request(app)
      .get(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-requirement`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .query({ action: "CHECK_IN" });

    expect(response.status).toBe(403);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);
    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
  it("rejects photo requirement requests without authentication", async () => {
    const companyId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(`/api/v1/companies/${companyId}/attendance/photo-requirement`)
      .query({ action: "CHECK_IN" });

    expect(response.status).toBe(401);

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);
    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
  it("uses the attendance record policy for CHECK_OUT photo requirements", async () => {
    const fixture = await createAuthenticatedEmployeeFixture();

    await Permission.create({
      code: "attendance.check_out",
      module: "attendance",
      action: "check_out",
      name: "Attendance Check Out",
      status: "ACTIVE",
    }).then(async (permission) => {
      await Role.updateOne(
        { _id: fixture.role._id },
        { $addToSet: { permissionIds: permission._id } },
      );
    });

    await AttendancePolicy.updateOne(
      { _id: fixture.policy._id },
      {
        $set: {
          "photoCapture.requireForCheckOut": true,
        },
      },
    );

    const attendance = await Attendance.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.companyAccess._id,
      employeeId: fixture.employee._id,
      attendanceDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: fixture.company.timezone || "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      shiftId: fixture.shift._id,
      attendancePolicyId: fixture.policy._id,
      attendanceMode: "OFFICE",
      shiftSnapshot: {
        name: fixture.shift.name,
        code: fixture.shift.code,
        startTime: fixture.shift.startTime,
        endTime: fixture.shift.endTime,
        fullDayMinutes: fixture.shift.fullDayMinutes,
        halfDayMinutes: fixture.shift.halfDayMinutes,
      },
      workSessions: [
        {
          checkInAt: new Date(),
          status: "OPEN",
        },
      ],
      firstCheckInAt: new Date(),
    });

    const newerPolicy = await AttendancePolicy.create({
      companyId: fixture.company._id,
      name: "New Checkout Policy",
      code: "NEW_CHECKOUT",
      effectiveFrom: new Date("2026-10-30T00:00:00.000Z"),
      isDefault: false,
      status: "ACTIVE",
      photoCapture: {
        enabled: true,
        requireForCheckOut: false,
        requireForOffice: true,
      },
    });

    const response = await request(app)
      .get(
        `/api/v1/companies/${fixture.company._id}/attendance/photo-requirement`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .query({
        action: "CHECK_OUT",
        attendanceId: String(attendance._id),
      });

    expect(newerPolicy._id).toBeDefined();


    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      action: "CHECK_OUT",
      attendanceMode: "OFFICE",
      photoCaptureEnabled: true,
      photoRequired: true,
    });

    expect(await AttendancePhotoEvidence.countDocuments()).toBe(0);
    expect(storageMocks.uploadAttendancePhoto).not.toHaveBeenCalled();
  });
});
