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
import Employee from "../../src/modules/employees/employee.model.js";
import Department from "../../src/modules/departments/department.model.js";
import Team from "../../src/modules/teams/team.model.js";
import { generateAccessToken } from "../../src/modules/auth/token.service.js";
import { PERMISSIONS } from "../../src/constants/permissions.constants.js";

describe("Employee profile update authorization", () => {
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
      name: "Employee Deletion Test Company",
      code: "EMPDEL",
      slug: "employee-deletion-test-company",
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
      name: "Custom Employee Manager",
      code: "CUSTOM_EMPLOYEE_MANAGER",
      scopeType: "COMPANY",
      permissionIds: permissionIdsFor(permissions),
      status: "ACTIVE",
    });

    const targetRole = await Role.create({
      companyId: company._id,
      name: "Custom Employee",
      code: "CUSTOM_EMPLOYEE",
      scopeType: "TEAM",
      permissionIds: permissionIdsFor(targetRolePermissions),
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Employee",
      lastName: "Manager",
      email: "employee.manager@example.com",
      password: "Actor@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const target = await User.create({
      firstName: "Employee",
      lastName: "Target",
      email: "employee.target@example.com",
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

    const employee = await Employee.create({
      companyId: company._id,
      companyAccessId: targetAccess._id,
      userId: target._id,
    });

    await User.updateOne(
      { _id: actor._id },
      { $set: { passwordChangedAt: new Date(Date.now() - 60_000) } },
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
      employee,
      token,
    };
  };

  it("allows an authorized actor to update an eligible employee profile", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Indian",
        },
      });

    expect(response.status).toBe(200);

    const updated = await Employee.findById(fixture.employee._id);

    expect(updated.personalDetails.nationality).toBe("Indian");
    expect(String(updated.updatedBy)).toBe(String(fixture.actor._id));
    expect(updated.isDeleted).toBe(false);
  });

  it("rejects employee profile updates without employee.update permission", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_READ],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.personalDetails?.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects an actor updating their own employee profile", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const actorEmployee = await Employee.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.actorAccess._id,
      userId: fixture.actor._id,
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${actorEmployee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(actorEmployee._id);

    expect(unchanged.personalDetails.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects updates to employees with permissions exceeding the actor's permissions", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
      targetRolePermissions: [PERMISSIONS.ADMIN_UPDATE],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.personalDetails.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects department-scoped actors updating employees in another department", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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

    await CompanyAccess.updateOne(
      { _id: fixture.actorAccess._id },
      { $set: { departmentId: departmentA._id } },
    );

    await CompanyAccess.updateOne(
      { _id: fixture.targetAccess._id },
      { $set: { departmentId: departmentB._id } },
    );

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: { scopeType: "DEPARTMENT" },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.personalDetails.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("allows department-scoped actors to update employees in their department", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
        $set: { departmentId: department._id },
      },
    );

    await Role.updateMany(
      {
        _id: {
          $in: [fixture.actorAccess.roleId, fixture.targetAccess.roleId],
        },
      },
      {
        $set: { scopeType: "DEPARTMENT" },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(200);

    const updated = await Employee.findById(fixture.employee._id);

    expect(updated.personalDetails.nationality).toBe("Canadian");
    expect(String(updated.updatedBy)).toBe(String(fixture.actor._id));
    expect(updated.isDeleted).toBe(false);
  });

  it("allows team-scoped actors to update employees in their managed team", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
        $set: { scopeType: "TEAM" },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(200);

    const updated = await Employee.findById(fixture.employee._id);

    expect(updated.personalDetails.nationality).toBe("Canadian");
    expect(String(updated.updatedBy)).toBe(String(fixture.actor._id));
    expect(updated.isDeleted).toBe(false);
  });

  it("rejects team-scoped actors updating employees outside their managed teams", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
        $set: { scopeType: "TEAM" },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.personalDetails.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects team-scoped updates when the managed team is inactive", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
      name: "Inactive Development Team",
      code: "INACTIVEDEV",
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
        $set: { scopeType: "TEAM" },
      },
    );

    await Team.updateOne({ _id: team._id }, { $set: { status: "INACTIVE" } });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.personalDetails.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects employee profile updates across company boundaries", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const otherCompany = await Company.create({
      name: "Other Employee Test Company",
      code: "OTHEREMP",
      slug: "other-employee-test-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const otherRole = await Role.create({
      companyId: otherCompany._id,
      name: "Other Company Employee",
      code: "OTHER_COMPANY_EMPLOYEE",
      scopeType: "TEAM",
      permissionIds: [],
      status: "ACTIVE",
    });

    const otherUser = await User.create({
      firstName: "Other",
      lastName: "Employee",
      email: "other.employee@example.com",
      password: "Target@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const otherAccess = await CompanyAccess.create({
      userId: otherUser._id,
      companyId: otherCompany._id,
      roleId: otherRole._id,
      status: "ACTIVE",
    });

    const otherEmployee = await Employee.create({
      companyId: otherCompany._id,
      companyAccessId: otherAccess._id,
      userId: otherUser._id,
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${otherEmployee._id}`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        personalDetails: {
          nationality: "Canadian",
        },
      });

    expect([403, 404]).toContain(response.status);

    const unchanged = await Employee.findById(otherEmployee._id);

    expect(unchanged.personalDetails.nationality).toBe("Indian");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("allows an authorized actor to update an eligible employee status", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(200);

    const updated = await Employee.findById(fixture.employee._id);

    expect(updated.status).toBe("INACTIVE");
    expect(String(updated.updatedBy)).toBe(String(fixture.actor._id));
    expect(updated.isDeleted).toBe(false);
  });

  it("rejects employee status updates without employee.update permission", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_READ],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects an actor changing their own employee status", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const ownEmployee = await Employee.create({
      companyId: fixture.company._id,
      companyAccessId: fixture.actorAccess._id,
      userId: fixture.actor._id,
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${ownEmployee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(ownEmployee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects status updates to employees with permissions exceeding the actor's permissions", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
      targetRolePermissions: [PERMISSIONS.ADMIN_UPDATE],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects department-scoped actors changing employee status outside their department", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const engineering = await Department.create({
      companyId: fixture.company._id,
      name: "Engineering",
      code: "ENG",
      status: "ACTIVE",
    });

    const finance = await Department.create({
      companyId: fixture.company._id,
      name: "Finance",
      code: "FIN",
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.actorAccess._id },
      { $set: { departmentId: engineering._id } },
    );

    await CompanyAccess.updateOne(
      { _id: fixture.targetAccess._id },
      { $set: { departmentId: finance._id } },
    );

    await Role.updateOne(
      { _id: fixture.actorAccess.roleId },
      { $set: { scopeType: "DEPARTMENT" } },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("allows department-scoped actors to change employee status within their department", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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

    await Role.updateOne(
      { _id: fixture.actorAccess.roleId },
      { $set: { scopeType: "DEPARTMENT" } },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(200);

    const updated = await Employee.findById(fixture.employee._id);

    expect(updated.status).toBe("INACTIVE");
    expect(String(updated.updatedBy)).toBe(String(fixture.actor._id));
    expect(updated.isDeleted).toBe(false);
  });

  it("allows team-scoped actors to change employee status within their managed team", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
        $set: { scopeType: "TEAM" },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(200);

    const updated = await Employee.findById(fixture.employee._id);

    expect(updated.status).toBe("INACTIVE");
    expect(String(updated.updatedBy)).toBe(String(fixture.actor._id));
    expect(updated.isDeleted).toBe(false);
  });

  it("rejects team-scoped actors changing employee status outside their managed teams", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
        $set: { scopeType: "TEAM" },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects employee status updates when the managed team is inactive", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
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
      name: "Inactive Development Team",
      code: "INACTIVEDEV",
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
        $set: { scopeType: "TEAM" },
      },
    );

    await Team.updateOne({ _id: team._id }, { $set: { status: "INACTIVE" } });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${fixture.employee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(403);

    const unchanged = await Employee.findById(fixture.employee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });

  it("rejects employee status updates across company boundaries", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_UPDATE],
    });

    const otherCompany = await Company.create({
      name: "Other Status Test Company",
      code: "OTHERSTATUS",
      slug: "other-status-test-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const otherRole = await Role.create({
      companyId: otherCompany._id,
      name: "Other Company Employee",
      code: "OTHER_COMPANY_EMPLOYEE",
      scopeType: "TEAM",
      permissionIds: [],
      status: "ACTIVE",
    });

    const otherUser = await User.create({
      firstName: "Other",
      lastName: "Status Target",
      email: "other.status.target@example.com",
      password: "Target@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const otherAccess = await CompanyAccess.create({
      userId: otherUser._id,
      companyId: otherCompany._id,
      roleId: otherRole._id,
      status: "ACTIVE",
    });

    const otherEmployee = await Employee.create({
      companyId: otherCompany._id,
      companyAccessId: otherAccess._id,
      userId: otherUser._id,
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/employees/${otherEmployee._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({
        status: "INACTIVE",
      });

    expect([403, 404]).toContain(response.status);

    const unchanged = await Employee.findById(otherEmployee._id);

    expect(unchanged.status).toBe("ACTIVE");
    expect(unchanged.updatedBy).toBeFalsy();
    expect(unchanged.isDeleted).toBe(false);
  });
});
