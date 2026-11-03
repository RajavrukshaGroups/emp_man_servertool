import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";

import app from "../../src/app.js";

import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Attendance photo viewing HTTP security", () => {
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

  it("rejects requests without an access token", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const attendanceId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();

    const response = await request(app).get(
      `/api/v1/companies/${companyId}/attendance/${attendanceId}/sessions/${sessionId}/photo?action=CHECK_IN`,
    );

    expect(response.status).toBe(401);
  });

  it("rejects requests with an invalid access token", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const attendanceId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(
        `/api/v1/companies/${companyId}/attendance/${attendanceId}/sessions/${sessionId}/photo?action=CHECK_IN`,
      )
      .set("Authorization", "Bearer invalid.jwt.token");

    expect(response.status).toBe(401);
  });

  it("rejects authenticated users without attendance.photo_view permission", async () => {
    const company = await Company.create({
      name: "Photo HTTP Security Test Company",
      code: "PHST",
      slug: "photo-http-security-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Photo",
      lastName: "Tester",
      email: "photo-http-test@example.com",
      password: "TestPassword@123",
      status: "ACTIVE",
    });

    // Simulate a password that was last changed in the past.
    // This ensures the newly issued JWT is valid for this test.
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
      name: "Photo Restricted Employee",
      code: "PHOTO_RESTRICTED",
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

    const attendanceId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(
        `/api/v1/companies/${company._id}/attendance/${attendanceId}/sessions/${sessionId}/photo?action=CHECK_IN`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects an authenticated request for another company", async () => {
    const company = await Company.create({
      name: "Photo Company A",
      code: "PCA",
      slug: "photo-company-a",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Company",
      lastName: "Tester",
      email: "photo-company-test@example.com",
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
      name: "Company Test Role",
      code: "COMPANY_TEST",
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

    const anotherCompanyId = new mongoose.Types.ObjectId();
    const attendanceId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(
        `/api/v1/companies/${anotherCompanyId}/attendance/${attendanceId}/sessions/${sessionId}/photo?action=CHECK_IN`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("streams an authorized attendance photo as JPEG with secure headers", async () => {
    const company = await Company.create({
      name: "Authorized Photo Test Company",
      code: "APHC",
      slug: "authorized-photo-http-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Authorized",
      lastName: "Tester",
      email: "authorized-photo@example.com",
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
      code: "attendance.photo_view",
      module: "attendance",
      action: "photo_view",
      name: "View Attendance Photos",
      status: "ACTIVE",
    });

    const role = await Role.create({
      companyId: company._id,
      name: "Authorized Photo Employee",
      code: "PHOTO_AUTHORIZED",
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

    const sessionId = new mongoose.Types.ObjectId();

    const photoPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${company._id}/${companyAccess._id}/check-in/test-photo`;

    const attendance = await Attendance.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceDate: "2026-10-30",
      attendanceMode: "OFFICE",
      shiftId: new mongoose.Types.ObjectId(),
      attendancePolicyId: new mongoose.Types.ObjectId(),
      shiftSnapshot: {
        name: "Day Shift",
        code: "DAY",
        startTime: "09:00",
        endTime: "18:00",
        fullDayMinutes: 480,
        halfDayMinutes: 240,
      },
      workSessions: [
        {
          _id: sessionId,
          checkInAt: new Date("2026-10-30T09:00:00.000Z"),
          status: "OPEN",
          checkInPhotoEvidence: {
            status: "CAPTURED",
            imagePublicId: photoPublicId,
            imageAssetId: "private-test-asset-id",
            capturedAt: new Date("2026-10-30T08:59:00.000Z"),
          },
        },
      ],
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0xff, 0xd9,
    ]);

    const originalFetch = globalThis.fetch;

    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(jpegBytes, {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
              "content-length": String(jpegBytes.length),
            },
          }),
        ),
      );

      const response = await request(app)
        .get(
          `/api/v1/companies/${company._id}/attendance/${attendance._id}/sessions/${sessionId}/photo?action=CHECK_IN`,
        )
        .set("Authorization", `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];

          res.on("data", (chunk) => chunks.push(chunk));

          res.on("end", () => {
            callback(null, Buffer.concat(chunks));
          });

          res.on("error", callback);
        });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/image\/jpeg/);
      expect(response.headers["cache-control"]).toBe("no-store, private");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-disposition"]).toBe("inline");

      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.equals(jpegBytes)).toBe(true);

      expect(response.text ?? "").not.toContain(photoPublicId);
      expect(response.text ?? "").not.toContain("private-test-asset-id");
      expect(response.headers).not.toHaveProperty("location");

      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
