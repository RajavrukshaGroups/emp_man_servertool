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
import { MongoMemoryReplSet } from "mongodb-memory-server";

import app from "../../src/app.js";

import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import FieldVisit from "../../src/modules/attendance/fieldVisit.model.js";

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Field Visit photo viewing HTTP security", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await mongoose.connection.dropDatabase();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet?.stop();
  });

  it("rejects requests without an access token", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const fieldVisitId = new mongoose.Types.ObjectId();

    const response = await request(app).get(
      `/api/v1/companies/${companyId}/attendance/field-visits/${fieldVisitId}/photo?action=START`,
    );

    expect(response.status).toBe(401);
  });

  it("rejects requests with an invalid access token", async () => {
    const companyId = new mongoose.Types.ObjectId();
    const fieldVisitId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(
        `/api/v1/companies/${companyId}/attendance/field-visits/${fieldVisitId}/photo?action=START`,
      )
      .set("Authorization", "Bearer invalid.jwt.token");

    expect(response.status).toBe(401);
  });

  it("rejects authenticated users without attendance.photo_view permission", async () => {
    const company = await Company.create({
      name: "Field Visit Photo Restricted Company",
      code: "FVPR",
      slug: "field-visit-photo-restricted",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Restricted",
      lastName: "Tester",
      email: "field-visit-restricted@example.com",
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
      name: "Restricted Field Visit Employee",
      code: "FIELD_VISIT_RESTRICTED",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: user._id,
      roleId: role._id,
      status: "ACTIVE",
      attendanceMode: "FIELD",
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    const fieldVisitId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(
        `/api/v1/companies/${company._id}/attendance/field-visits/${fieldVisitId}/photo?action=START`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects an authenticated request for another company's field visit photo", async () => {
    const company = await Company.create({
      name: "Field Visit Company A",
      code: "FVCA",
      slug: "field-visit-company-a",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Company",
      lastName: "Tester",
      email: "field-visit-company-test@example.com",
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
      name: "Field Visit Photo Viewer",
      code: "FIELD_VISIT_PHOTO_VIEWER",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: user._id,
      roleId: role._id,
      status: "ACTIVE",
      attendanceMode: "FIELD",
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    const anotherCompanyId = new mongoose.Types.ObjectId();
    const fieldVisitId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(
        `/api/v1/companies/${anotherCompanyId}/attendance/field-visits/${fieldVisitId}/photo?action=START`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("streams authorized START and END field visit photos securely", async () => {
    const company = await Company.create({
      name: "Authorized Field Visit Photo Company",
      code: "AFVP",
      slug: "authorized-field-visit-photo",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Authorized",
      lastName: "Viewer",
      email: "authorized-field-visit@example.com",
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
      name: "Authorized Field Visit Viewer",
      code: "FIELD_VISIT_AUTHORIZED",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId: user._id,
      roleId: role._id,
      status: "ACTIVE",
      attendanceMode: "FIELD",
    });

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId: user._id,
      status: "ACTIVE",
    });

    const startPhotoPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${company._id}/${companyAccess._id}/field-visit-start/test-photo`;

    const fieldVisit = await FieldVisit.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceDate: "2026-10-30",
      visitType: "CLIENT_VISIT",
      purpose: "Client meeting",
      startedAt: new Date("2026-10-30T09:00:00.000Z"),
      startLocation: {
        latitude: 12.9716,
        longitude: 77.5946,
        capturedAt: new Date("2026-10-30T09:00:00.000Z"),
      },
      startPhotoEvidence: {
        status: "CAPTURED",
        imagePublicId: startPhotoPublicId,
        imageAssetId: "private-field-visit-start-asset",
        capturedAt: new Date("2026-10-30T08:59:00.000Z"),
      },
      status: "IN_PROGRESS",
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

    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(jpegBytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(jpegBytes.length),
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const fetchPhoto = (action) =>
      request(app)
        .get(
          `/api/v1/companies/${company._id}/attendance/field-visits/${fieldVisit._id}/photo?action=${action}`,
        )
        .set("Authorization", `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];

          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
          res.on("error", callback);
        });

    const expectSecurePhotoResponse = (response) => {
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/image\/jpeg/);
      expect(response.headers["cache-control"]).toBe("no-store, private");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-disposition"]).toBe("inline");
      expect(response.headers).not.toHaveProperty("location");

      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.equals(jpegBytes)).toBe(true);
    };

    // Verify START photograph.
    const startResponse = await fetchPhoto("START");

    expectSecurePhotoResponse(startResponse);

    expect(startResponse.text ?? "").not.toContain(startPhotoPublicId);
    expect(startResponse.text ?? "").not.toContain(
      "private-field-visit-start-asset",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Complete the visit and attach END photograph.
    const endPhotoPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${company._id}/${companyAccess._id}/field-visit-end/test-photo`;

    await FieldVisit.findByIdAndUpdate(fieldVisit._id, {
      $set: {
        status: "COMPLETED",
        endedAt: new Date("2026-10-30T11:00:00.000Z"),
        endLocation: {
          latitude: 12.9716,
          longitude: 77.5946,
          capturedAt: new Date("2026-10-30T11:00:00.000Z"),
        },
        endPhotoEvidence: {
          status: "CAPTURED",
          imagePublicId: endPhotoPublicId,
          imageAssetId: "private-field-visit-end-asset",
          capturedAt: new Date("2026-10-30T10:59:00.000Z"),
        },
      },
    });

    // Verify END photograph.
    const endResponse = await fetchPhoto("END");

    expectSecurePhotoResponse(endResponse);

    expect(endResponse.text ?? "").not.toContain(endPhotoPublicId);
    expect(endResponse.text ?? "").not.toContain(
      "private-field-visit-end-asset",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const startFetchUrl = String(fetchMock.mock.calls[0][0]);
    const endFetchUrl = String(fetchMock.mock.calls[1][0]);

    expect(startFetchUrl).not.toBe(endFetchUrl);
  });
});
