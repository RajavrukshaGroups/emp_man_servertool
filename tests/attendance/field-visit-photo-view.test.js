import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import FieldVisit from "../../src/modules/attendance/fieldVisit.model.js";

import "../../src/modules/users/user.model.js";
import "../../src/modules/departments/department.model.js";
import Team from "../../src/modules/teams/team.model.js";
import "../../src/modules/roles/role.model.js";
import "../../src/modules/attendance/attendanceLocation.model.js";

import { getAuthorizedFieldVisitPhotoEvidence } from "../../src/modules/attendance/fieldVisitPhotoView.service.js";

describe("Field Visit photo viewing", () => {
  let replicaSet;

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

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  const createFixture = async () => {
    const userId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();

    const company = await Company.create({
      name: "Field Visit Photo View Test Company",
      code: "FVPV",
      slug: "field-visit-photo-view-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      companyId: company._id,
      userId,
      roleId,
      status: "ACTIVE",
      attendanceMode: "FIELD",
    });

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      userId,
      status: "ACTIVE",
    });

    const photoPublicId =
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
        imagePublicId: photoPublicId,
        imageAssetId: "field-visit-start-test-asset",
        capturedAt: new Date("2026-10-30T08:59:00.000Z"),
      },
      status: "IN_PROGRESS",
    });

    return {
      company,
      companyAccess,
      employee,
      fieldVisit,
      photoPublicId,
      requesterContext: {
        accessType: "COMPANY",
        roleScopeType: "COMPANY",
        companyId: company._id,
        companyAccessId: companyAccess._id,
        userId,
      },
    };
  };

  it("retrieves captured START field visit photo evidence", async () => {
    const fixture = await createFixture();

    const result = await getAuthorizedFieldVisitPhotoEvidence({
      companyId: fixture.company._id.toString(),
      fieldVisitId: fixture.fieldVisit._id.toString(),
      action: "START",
      requesterContext: fixture.requesterContext,
    });

    expect(result.imagePublicId).toBe(fixture.photoPublicId);
    expect(result.imageAssetId).toBe("field-visit-start-test-asset");
    expect(result.action).toBe("START");
  });

  it("retrieves captured END field visit photo evidence", async () => {
    const fixture = await createFixture();

    const endPhotoPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${fixture.company._id}/${fixture.companyAccess._id}/field-visit-end/test-photo`;

    await FieldVisit.findByIdAndUpdate(fixture.fieldVisit._id, {
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
          imageAssetId: "field-visit-end-test-asset",
          capturedAt: new Date("2026-10-30T10:59:00.000Z"),
        },
      },
    });

    const result = await getAuthorizedFieldVisitPhotoEvidence({
      companyId: fixture.company._id.toString(),
      fieldVisitId: fixture.fieldVisit._id.toString(),
      action: "END",
      requesterContext: fixture.requesterContext,
    });

    expect(result.imagePublicId).toBe(endPhotoPublicId);
    expect(result.imageAssetId).toBe("field-visit-end-test-asset");
    expect(result.action).toBe("END");
    expect(result.imagePublicId).not.toBe(fixture.photoPublicId);
  });

  it("rejects field visit photo access from another company", async () => {
    const fixture = await createFixture();

    const anotherCompanyId = new mongoose.Types.ObjectId();

    await expect(
      getAuthorizedFieldVisitPhotoEvidence({
        companyId: anotherCompanyId.toString(),
        fieldVisitId: fixture.fieldVisit._id.toString(),
        action: "START",
        requesterContext: {
          ...fixture.requesterContext,
          companyId: anotherCompanyId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("denies SELF scope access to another employee's field visit photo", async () => {
    const fixture = await createFixture();

    const anotherEmployeeAccessId = new mongoose.Types.ObjectId();
    const anotherUserId = new mongoose.Types.ObjectId();

    await expect(
      getAuthorizedFieldVisitPhotoEvidence({
        companyId: fixture.company._id.toString(),
        fieldVisitId: fixture.fieldVisit._id.toString(),
        action: "START",
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "SELF",
          companyId: fixture.company._id,
          companyAccessId: anotherEmployeeAccessId,
          userId: anotherUserId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("denies a Team Lead access to an unmanaged team's field visit photo", async () => {
    const fixture = await createFixture();

    const teamLeadAccessId = new mongoose.Types.ObjectId();
    const teamLeadUserId = new mongoose.Types.ObjectId();

    await expect(
      getAuthorizedFieldVisitPhotoEvidence({
        companyId: fixture.company._id.toString(),
        fieldVisitId: fixture.fieldVisit._id.toString(),
        action: "START",
        requesterContext: {
          accessType: "COMPANY",
          roleScopeType: "TEAM",
          companyId: fixture.company._id,
          companyAccessId: teamLeadAccessId,
          userId: teamLeadUserId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("allows a Team Lead to view a managed team member's field visit photo", async () => {
    const fixture = await createFixture();

    const teamLeadUserId = new mongoose.Types.ObjectId();
    const teamLeadRoleId = new mongoose.Types.ObjectId();

    const teamLeadAccess = await CompanyAccess.create({
      companyId: fixture.company._id,
      userId: teamLeadUserId,
      roleId: teamLeadRoleId,
      status: "ACTIVE",
      attendanceMode: "OFFICE",
    });

    const departmentId = new mongoose.Types.ObjectId();

    const team = await Team.create({
      companyId: fixture.company._id,
      departmentId,
      name: "Field Operations Team",
      code: "FIELD-OPS",
      teamLeadIds: [teamLeadAccess._id],
      status: "ACTIVE",
    });

    await CompanyAccess.findByIdAndUpdate(fixture.companyAccess._id, {
      $set: {
        departmentId,
        teamId: team._id,
      },
    });

    const result = await getAuthorizedFieldVisitPhotoEvidence({
      companyId: fixture.company._id.toString(),
      fieldVisitId: fixture.fieldVisit._id.toString(),
      action: "START",
      requesterContext: {
        accessType: "COMPANY",
        roleScopeType: "TEAM",
        companyId: fixture.company._id,
        companyAccessId: teamLeadAccess._id,
        userId: teamLeadUserId,
      },
    });

    expect(result.imagePublicId).toBe(fixture.photoPublicId);
    expect(result.action).toBe("START");
  });

  it("rejects END photo retrieval when the field visit is still in progress", async () => {
    const fixture = await createFixture();

    await expect(
      getAuthorizedFieldVisitPhotoEvidence({
        companyId: fixture.company._id.toString(),
        fieldVisitId: fixture.fieldVisit._id.toString(),
        action: "END",
        requesterContext: fixture.requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects field visit photo evidence with status NOT_REQUIRED", async () => {
    const fixture = await createFixture();

    await FieldVisit.findByIdAndUpdate(fixture.fieldVisit._id, {
      $set: {
        startPhotoEvidence: {
          status: "NOT_REQUIRED",
        },
      },
    });

    await expect(
      getAuthorizedFieldVisitPhotoEvidence({
        companyId: fixture.company._id.toString(),
        fieldVisitId: fixture.fieldVisit._id.toString(),
        action: "START",
        requesterContext: fixture.requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects field visit photo evidence with status EXEMPTED", async () => {
    const fixture = await createFixture();

    const exemptionId = new mongoose.Types.ObjectId();

    await FieldVisit.findByIdAndUpdate(fixture.fieldVisit._id, {
      $set: {
        startPhotoEvidence: {
          status: "EXEMPTED",
          exemptionId,
        },
      },
    });

    await expect(
      getAuthorizedFieldVisitPhotoEvidence({
        companyId: fixture.company._id.toString(),
        fieldVisitId: fixture.fieldVisit._id.toString(),
        action: "START",
        requesterContext: fixture.requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
