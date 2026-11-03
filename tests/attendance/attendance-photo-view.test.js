import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import Attendance from "../../src/modules/attendance/attendance.model.js";
import Team from "../../src/modules/teams/team.model.js";

import "../../src/modules/users/user.model.js";
import "../../src/modules/departments/department.model.js";
import "../../src/modules/teams/team.model.js";
import "../../src/modules/roles/role.model.js";
import "../../src/modules/attendance/attendanceLocation.model.js";

import { getAuthorizedAttendancePhotoEvidence } from "../../src/modules/attendance/attendancePhotoView.service.js";
import { canAccessCompanyAccess } from "../../src/modules/attendance/attendance.scope.js";

describe("Attendance photo viewing", () => {
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
    const shiftId = new mongoose.Types.ObjectId();
    const policyId = new mongoose.Types.ObjectId();

    const company = await Company.create({
      name: "Attendance Photo View Test Company",
      code: "APVT",
      slug: "attendance-photo-view-test",
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

    const photoPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${company._id}/${companyAccess._id}/check-in/test-photo`;

    const sessionId = new mongoose.Types.ObjectId();
    const attendance = await Attendance.create({
      companyId: company._id,
      companyAccessId: companyAccess._id,
      employeeId: employee._id,
      attendanceDate: "2026-10-30",
      attendanceMode: "OFFICE",
      shiftId,
      attendancePolicyId: policyId,
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
            imageAssetId: "test-asset-id",
            capturedAt: new Date("2026-10-30T08:59:00.000Z"),
          },
        },
      ],
    });

    return {
      company,
      companyAccess,
      employee,
      attendance,
      sessionId,
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

  it("retrieves captured check-in photo evidence", async () => {
    const fixture = await createFixture();

    const result = await getAuthorizedAttendancePhotoEvidence({
      companyId: fixture.company._id.toString(),
      attendanceId: fixture.attendance._id.toString(),
      sessionId: fixture.sessionId.toString(),
      action: "CHECK_IN",
      requesterContext: fixture.requesterContext,
    });

    expect(result.imagePublicId).toBe(fixture.photoPublicId);
    expect(result.imageAssetId).toBe("test-asset-id");
    expect(result.action).toBe("CHECK_IN");
  });

  it("rejects an invalid work-session ID", async () => {
    const fixture = await createFixture();

    await expect(
      getAuthorizedAttendancePhotoEvidence({
        companyId: fixture.company._id.toString(),
        attendanceId: fixture.attendance._id.toString(),
        sessionId: new mongoose.Types.ObjectId().toString(),
        action: "CHECK_IN",
        requesterContext: fixture.requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects attendance photo access from another company", async () => {
    const fixture = await createFixture();

    const anotherCompanyId = new mongoose.Types.ObjectId();

    await expect(
      getAuthorizedAttendancePhotoEvidence({
        companyId: anotherCompanyId.toString(),
        attendanceId: fixture.attendance._id.toString(),
        sessionId: fixture.sessionId.toString(),
        action: "CHECK_IN",
        requesterContext: {
          ...fixture.requesterContext,
          companyId: anotherCompanyId,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects another employee viewing attendance photos", async () => {
    const fixture = await createFixture();

    const anotherEmployeeAccessId = new mongoose.Types.ObjectId();

    const requesterContext = {
      ...fixture.requesterContext,
      companyAccessId: anotherEmployeeAccessId,
      roleScopeType: "SELF",
    };

    await expect(
      getAuthorizedAttendancePhotoEvidence({
        companyId: fixture.company._id.toString(),
        attendanceId: fixture.attendance._id.toString(),
        sessionId: fixture.sessionId.toString(),
        action: "CHECK_IN",
        requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("denies SELF scope access to another employee", async () => {
    const fixture = await createFixture();

    const anotherEmployeeAccessId = new mongoose.Types.ObjectId();

    const requesterContext = {
      accessType: "COMPANY",
      roleScopeType: "SELF",
      companyId: fixture.company._id,
      companyAccessId: anotherEmployeeAccessId,
      userId: new mongoose.Types.ObjectId(),
    };

    const allowed = await canAccessCompanyAccess({
      requesterContext,
      companyId: fixture.company._id,
      targetCompanyAccessId: fixture.companyAccess._id,
    });

    expect(allowed).toBe(false);
  });

  it("denies department-scoped access to another department", async () => {
    const fixture = await createFixture();

    const requesterContext = {
      accessType: "COMPANY",
      roleScopeType: "DEPARTMENT",
      companyId: fixture.company._id,
      companyAccessId: new mongoose.Types.ObjectId(),
      departmentId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
    };

    const allowed = await canAccessCompanyAccess({
      requesterContext,
      companyId: fixture.company._id,
      targetCompanyAccessId: fixture.companyAccess._id,
    });

    expect(allowed).toBe(false);
  });

  it("allows a Team Lead to view attendance photos of a managed team member", async () => {
    const fixture = await createFixture();

    const teamLeadAccessId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    const managedTeam = await Team.create({
      companyId: fixture.company._id,
      departmentId,
      name: "Managed Team",
      code: "MGT",
      teamLeadIds: [teamLeadAccessId],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.companyAccess._id },
      {
        $set: {
          departmentId,
          teamId: managedTeam._id,
        },
      },
    );

    const requesterContext = {
      accessType: "COMPANY",
      roleScopeType: "TEAM",
      companyId: fixture.company._id,
      companyAccessId: teamLeadAccessId,
      userId: new mongoose.Types.ObjectId(),
    };

    const result = await getAuthorizedAttendancePhotoEvidence({
      companyId: fixture.company._id.toString(),
      attendanceId: fixture.attendance._id.toString(),
      sessionId: fixture.sessionId.toString(),
      action: "CHECK_IN",
      requesterContext,
    });

    expect(result.imagePublicId).toBe(fixture.photoPublicId);
  });

  it("denies a Team Lead access to an unmanaged team's attendance photos", async () => {
    const fixture = await createFixture();

    const teamLeadAccessId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();

    const unmanagedTeam = await Team.create({
      companyId: fixture.company._id,
      departmentId,
      name: "Unmanaged Team",
      code: "UMT",
      teamLeadIds: [],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.companyAccess._id },
      {
        $set: {
          departmentId,
          teamId: unmanagedTeam._id,
        },
      },
    );

    const requesterContext = {
      accessType: "COMPANY",
      roleScopeType: "TEAM",
      companyId: fixture.company._id,
      companyAccessId: teamLeadAccessId,
      userId: new mongoose.Types.ObjectId(),
    };

    await expect(
      getAuthorizedAttendancePhotoEvidence({
        companyId: fixture.company._id.toString(),
        attendanceId: fixture.attendance._id.toString(),
        sessionId: fixture.sessionId.toString(),
        action: "CHECK_IN",
        requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("retrieves the correct checkout photo for a work session", async () => {
    const fixture = await createFixture();

    const checkoutPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${fixture.company._id}/checkout/test-photo`;

    await Attendance.updateOne(
      { _id: fixture.attendance._id },
      {
        $set: {
          "workSessions.0.checkOutPhotoEvidence": {
            status: "CAPTURED",
            imagePublicId: checkoutPublicId,
            imageAssetId: "test-checkout-asset",
            capturedAt: new Date("2026-10-30T17:00:00.000Z"),
          },
        },
      },
    );

    const result = await getAuthorizedAttendancePhotoEvidence({
      companyId: fixture.company._id.toString(),
      attendanceId: fixture.attendance._id.toString(),
      sessionId: fixture.sessionId.toString(),
      action: "CHECK_OUT",
      requesterContext: fixture.requesterContext,
    });

    expect(result.imagePublicId).toBe(checkoutPublicId);
    expect(result.imageAssetId).toBe("test-checkout-asset");
    expect(result.action).toBe("CHECK_OUT");
  });

  it("retrieves photos only from the requested work session", async () => {
    const fixture = await createFixture();

    const secondSessionId = new mongoose.Types.ObjectId();

    const secondPhotoPublicId =
      `employee-management/attendance/photo-evidence/` +
      `${fixture.company._id}/second-session/checkin-photo`;

    await Attendance.updateOne(
      { _id: fixture.attendance._id },
      {
        $push: {
          workSessions: {
            _id: secondSessionId,
            checkInAt: new Date("2026-10-30T12:00:00.000Z"),
            status: "OPEN",
            checkInPhotoEvidence: {
              status: "CAPTURED",
              imagePublicId: secondPhotoPublicId,
              imageAssetId: "second-session-asset",
              capturedAt: new Date("2026-10-30T11:59:00.000Z"),
            },
          },
        },
      },
    );

    const firstResult = await getAuthorizedAttendancePhotoEvidence({
      companyId: fixture.company._id.toString(),
      attendanceId: fixture.attendance._id.toString(),
      sessionId: fixture.sessionId.toString(),
      action: "CHECK_IN",
      requesterContext: fixture.requesterContext,
    });

    const secondResult = await getAuthorizedAttendancePhotoEvidence({
      companyId: fixture.company._id.toString(),
      attendanceId: fixture.attendance._id.toString(),
      sessionId: secondSessionId.toString(),
      action: "CHECK_IN",
      requesterContext: fixture.requesterContext,
    });

    expect(firstResult.imagePublicId).toBe(fixture.photoPublicId);
    expect(secondResult.imagePublicId).toBe(secondPhotoPublicId);

    expect(firstResult.imagePublicId).not.toBe(secondResult.imagePublicId);
  });

  it.each(["NOT_REQUIRED", "EXEMPTED"])(
    "rejects photo evidence with status %s",
    async (status) => {
      const fixture = await createFixture();

      await Attendance.updateOne(
        { _id: fixture.attendance._id },
        {
          $set: {
            "workSessions.0.checkInPhotoEvidence": {
              status,
            },
          },
        },
      );

      await expect(
        getAuthorizedAttendancePhotoEvidence({
          companyId: fixture.company._id.toString(),
          attendanceId: fixture.attendance._id.toString(),
          sessionId: fixture.sessionId.toString(),
          action: "CHECK_IN",
          requesterContext: fixture.requesterContext,
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    },
  );

  it("rejects a checkout photo that was never captured", async () => {
    const fixture = await createFixture();

    await expect(
      getAuthorizedAttendancePhotoEvidence({
        companyId: fixture.company._id.toString(),
        attendanceId: fixture.attendance._id.toString(),
        sessionId: fixture.sessionId.toString(),
        action: "CHECK_OUT",
        requesterContext: fixture.requesterContext,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("does not expose private Cloudinary identifiers in normal attendance queries", async () => {
    const fixture = await createFixture();

    const attendance = await Attendance.findById(fixture.attendance._id).lean();

    expect(attendance).not.toBeNull();

    const evidence = attendance.workSessions[0].checkInPhotoEvidence;

    expect(evidence.status).toBe("CAPTURED");
    expect(evidence.capturedAt).toBeDefined();

    expect(evidence.imagePublicId).toBeUndefined();
    expect(evidence.imageAssetId).toBeUndefined();
  });
});
