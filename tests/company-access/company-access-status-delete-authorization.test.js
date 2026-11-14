import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import app from "../../src/app.js";
import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Department from "../../src/modules/departments/department.model.js";
import Team from "../../src/modules/teams/team.model.js";
import { generateAccessToken } from "../../src/modules/auth/token.service.js";
import { PERMISSIONS } from "../../src/constants/permissions.constants.js";

describe("CompanyAccess status and deletion authorization", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    await mongoose.connect(replicaSet.getUri());
  });

  afterEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) =>
        collection.deleteMany({}),
      ),
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (replicaSet) await replicaSet.stop();
  });

  const createFixture = async ({
    permissions = [],
    targetRolePermissions = [],
  } = {}) => {
    const company = await Company.create({
      name: "Status Authorization Company",
      code: "STAUTH",
      slug: "status-authorization-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const codes = [...new Set([...permissions, ...targetRolePermissions])];

    const permissionDocs = await Promise.all(
      codes.map((code) => {
        const [module, action] = code.split(".");

        return Permission.create({
          code,
          name: code,
          module,
          action,
          status: "ACTIVE",
        });
      }),
    );

    const permissionIdsFor = (selectedCodes) =>
      permissionDocs
        .filter((permission) => selectedCodes.includes(permission.code))
        .map((permission) => permission._id);

    const actorRole = await Role.create({
      companyId: company._id,
      name: "Custom Access Manager",
      code: "CUSTOM_ACCESS_MANAGER",
      scopeType: "COMPANY",
      permissionIds: permissionIdsFor(permissions),
      status: "ACTIVE",
    });

    const targetRole = await Role.create({
      companyId: company._id,
      name: "Custom Employee Role",
      code: "CUSTOM_EMPLOYEE_ROLE",
      scopeType: "COMPANY",
      permissionIds: permissionIdsFor(targetRolePermissions),
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Status",
      lastName: "Actor",
      email: "status.actor@example.com",
      password: "Actor@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const target = await User.create({
      firstName: "Status",
      lastName: "Target",
      email: "status.target@example.com",
      password: "Target@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const actorAccess = await CompanyAccess.create({
      userId: actor._id,
      companyId: company._id,
      roleId: actorRole._id,
      status: "ACTIVE",
    });

    const targetAccess = await CompanyAccess.create({
      userId: target._id,
      companyId: company._id,
      roleId: targetRole._id,
      status: "ACTIVE",
    });

    await User.updateOne(
      { _id: actor._id },
      {
        $set: {
          passwordChangedAt: new Date(Date.now() - 60_000),
        },
      },
    );

    const token = generateAccessToken({
      userId: actor._id,
      accessType: "COMPANY",
      companyAccessId: actorAccess._id,
      companyId: company._id,
      roleId: actorRole._id,
    });

    return {
      company,
      actor,
      target,
      actorAccess,
      targetAccess,
      token,
    };
  };

  const updateStatus = (fixture, status) =>
    request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/access/${fixture.targetAccess._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ status });

  it("allows an authorized actor to deactivate eligible company access", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(200);

    const updated = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(updated.status).toBe("INACTIVE");
    expect(updated.isDeleted).toBe(false);
  });

  it("rejects deactivation without employee.deactivate permission", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
  });

  it("allows an authorized actor to soft-delete eligible company access", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const response = await request(app)
      .delete(
        `/api/v1/companies/${fixture.company._id}/access/${fixture.targetAccess._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`);

    expect(response.status).toBe(200);

    const deleted = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(deleted).not.toBeNull();
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.status).toBe("INACTIVE");
    expect(deleted.isPrimaryCompany).toBe(false);
    expect(deleted.deletedAt).toBeTruthy();
    expect(String(deleted.deletedBy)).toBe(String(fixture.actor._id));
  });

  it("rejects soft deletion without employee.deactivate permission", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const response = await request(app)
      .delete(
        `/api/v1/companies/${fixture.company._id}/access/${fixture.targetAccess._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`);

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(unchanged.isDeleted).toBe(false);
    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.deletedAt).toBeFalsy();
  });

  it("prevents an authorized actor from deactivating their own company access", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/access/${fixture.actorAccess._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.actorAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
  });

  it("prevents an authorized actor from deleting their own company access", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const response = await request(app)
      .delete(
        `/api/v1/companies/${fixture.company._id}/access/${fixture.actorAccess._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`);

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.actorAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
    expect(unchanged.deletedAt).toBeFalsy();
  });

  it("rejects deactivation of a privileged target even with permission delegation", async () => {
    const fixture = await createFixture({
      permissions: [
        PERMISSIONS.EMPLOYEE_DEACTIVATE,
        PERMISSIONS.ROLE_PERMISSION_DELEGATE,
      ],
      targetRolePermissions: [PERMISSIONS.ADMIN_UPDATE],
    });

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
  });

  it("prevents cross-company deactivation even with employee.deactivate permission", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const otherCompany = await Company.create({
      name: "Other Authorization Company",
      code: "OTHERAUTH",
      slug: "other-authorization-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const otherRole = await Role.create({
      companyId: otherCompany._id,
      name: "Other Company Employee",
      code: "OTHER_COMPANY_EMPLOYEE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const otherUser = await User.create({
      firstName: "Other",
      lastName: "Employee",
      email: "other.employee@example.com",
      password: "Employee@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const otherAccess = await CompanyAccess.create({
      companyId: otherCompany._id,
      userId: otherUser._id,
      roleId: otherRole._id,
      status: "ACTIVE",
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${otherCompany._id}/access/${otherAccess._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ status: "INACTIVE" });

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(otherAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
  });

  it("prevents department-scoped actors from deactivating employees in another department", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const departmentA = await Department.create({
      companyId: fixture.company._id,
      name: "Engineering",
      code: "ENG",
      status: "ACTIVE",
    });

    const departmentB = await Department.create({
      companyId: fixture.company._id,
      name: "Finance",
      code: "FIN",
      status: "ACTIVE",
    });

    const actorAccess = await CompanyAccess.findById(fixture.actorAccess._id);

    const targetAccess = await CompanyAccess.findById(fixture.targetAccess._id);

    actorAccess.departmentId = departmentA._id;
    targetAccess.departmentId = departmentB._id;

    await actorAccess.save();
    await targetAccess.save();

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: {
          scopeType: "DEPARTMENT",
        },
      },
    );

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
  });

  it("allows department-scoped actors to deactivate eligible employees in their department", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const department = await Department.create({
      companyId: fixture.company._id,
      name: "Engineering",
      code: "ENG",
      status: "ACTIVE",
    });

    await CompanyAccess.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess._id, fixture.targetAccess._id],
        },
      },
      {
        $set: {
          departmentId: department._id,
        },
      },
    );

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: {
          scopeType: "DEPARTMENT",
        },
      },
    );

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(200);

    const updated = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(updated.status).toBe("INACTIVE");
    expect(updated.isDeleted).toBe(false);
  });

  it("allows team-scoped actors to deactivate employees in their managed team", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const department = await Department.create({
      companyId: fixture.company._id,
      name: "Engineering",
      code: "ENG",
      status: "ACTIVE",
    });

    const team = await Team.create({
      companyId: fixture.company._id,
      departmentId: department._id,
      name: "Backend Development",
      code: "BACKEND",
      teamLeadIds: [fixture.actorAccess._id],
      status: "ACTIVE",
    });

    await CompanyAccess.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess._id, fixture.targetAccess._id],
        },
      },
      {
        $set: {
          departmentId: department._id,
          teamId: team._id,
        },
      },
    );

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: {
          scopeType: "TEAM",
        },
      },
    );

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(200);

    const updated = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(updated.status).toBe("INACTIVE");
    expect(updated.isDeleted).toBe(false);
  });

  it("prevents team-scoped actors from deactivating employees outside their managed teams", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const department = await Department.create({
      companyId: fixture.company._id,
      name: "Engineering",
      code: "ENG",
      status: "ACTIVE",
    });

    const managedTeam = await Team.create({
      companyId: fixture.company._id,
      departmentId: department._id,
      name: "Backend Development",
      code: "BACKEND",
      teamLeadIds: [fixture.actorAccess._id],
      status: "ACTIVE",
    });

    const unmanagedTeam = await Team.create({
      companyId: fixture.company._id,
      departmentId: department._id,
      name: "Frontend Development",
      code: "FRONTEND",
      teamLeadIds: [],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.actorAccess._id },
      {
        $set: {
          departmentId: department._id,
          teamId: managedTeam._id,
        },
      },
    );

    await CompanyAccess.updateOne(
      { _id: fixture.targetAccess._id },
      {
        $set: {
          departmentId: department._id,
          teamId: unmanagedTeam._id,
        },
      },
    );

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: {
          scopeType: "TEAM",
        },
      },
    );

    const response = await updateStatus(fixture, "INACTIVE");

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
  });

  it("prevents team-scoped actors from deleting employees outside their managed teams", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_DEACTIVATE],
    });

    const department = await Department.create({
      companyId: fixture.company._id,
      name: "Engineering",
      code: "ENG",
      status: "ACTIVE",
    });

    const managedTeam = await Team.create({
      companyId: fixture.company._id,
      departmentId: department._id,
      name: "Backend Development",
      code: "BACKEND",
      teamLeadIds: [fixture.actorAccess._id],
      status: "ACTIVE",
    });

    const unmanagedTeam = await Team.create({
      companyId: fixture.company._id,
      departmentId: department._id,
      name: "Frontend Development",
      code: "FRONTEND",
      teamLeadIds: [],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.actorAccess._id },
      {
        $set: {
          departmentId: department._id,
          teamId: managedTeam._id,
        },
      },
    );

    await CompanyAccess.updateOne(
      { _id: fixture.targetAccess._id },
      {
        $set: {
          departmentId: department._id,
          teamId: unmanagedTeam._id,
        },
      },
    );

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: {
          scopeType: "TEAM",
        },
      },
    );

    const response = await request(app)
      .delete(
        `/api/v1/companies/${fixture.company._id}/access/${fixture.targetAccess._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`);

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(fixture.targetAccess._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.isDeleted).toBe(false);
    expect(unchanged.deletedAt).toBeFalsy();
  });
});
