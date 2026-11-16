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

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Role management HTTP authorization", () => {
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

    if (replicaSet) {
      await replicaSet.stop();
    }
  });

  const createFixture = async ({ permissionCodes = [] } = {}) => {
    const company = await Company.create({
      name: "Role HTTP Company",
      code: "ROLEHTTP",
      slug: "role-http-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const otherCompany = await Company.create({
      name: "Other Role HTTP Company",
      code: "OTHERROLEHTTP",
      slug: "other-role-http-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permissions = await Permission.insertMany(
      [
        "role.read",
        "role.create",
        "role.update",
        "role.delete",
        "role.permission_delegate",
        "permission.read",
      ].map((code) => ({
        name: code,
        code,
        module: code.split(".")[0],
        action: code.split(".").slice(1).join("."),
        status: "ACTIVE",
      })),
    );

    const assignedPermissions = permissions.filter((permission) =>
      permissionCodes.includes(permission.code),
    );

    const actorRole = await Role.create({
      companyId: company._id,
      name: "Custom Managing Role",
      code: "CUSTOM_MANAGING_ROLE",
      scopeType: "COMPANY",
      permissionIds: assignedPermissions.map((permission) => permission._id),
      status: "ACTIVE",
    });

    const targetRole = await Role.create({
      companyId: company._id,
      name: "Target Role",
      code: "TARGET_ROLE",
      scopeType: "COMPANY",
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Role",
      lastName: "Tester",
      email: "role.http.tester@example.com",
      password: "TestPassword@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      userId: user._id,
      companyId: company._id,
      roleId: actorRole._id,
      status: "ACTIVE",
    });

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordChangedAt: new Date(Date.now() - 60_000),
        },
      },
    );

    const accessToken = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: companyAccess._id,
      companyId: company._id,
      roleId: actorRole._id,
    });

    return {
      company,
      otherCompany,
      actorRole,
      targetRole,
      user,
      accessToken,
    };
  };

  it("rejects unauthenticated role listing", async () => {
    const companyId = new mongoose.Types.ObjectId();

    const response = await request(app).get(
      `/api/v1/companies/${companyId}/roles`,
    );

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects role listing without role.read", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .get(`/api/v1/companies/${fixture.company._id}/roles`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects cross-company role listing", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.read"],
    });

    const response = await request(app)
      .get(`/api/v1/companies/${fixture.otherCompany._id}/roles`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("allows role listing with role.read in the assigned company", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.read"],
    });

    const response = await request(app)
      .get(`/api/v1/companies/${fixture.company._id}/roles`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("rejects role creation without role.create", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.read"],
    });

    const response = await request(app)
      .post(`/api/v1/companies/${fixture.company._id}/roles`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        name: "New Custom Role",
        code: "NEW_CUSTOM_ROLE",
        scopeType: "COMPANY",
        permissionIds: [],
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("rejects cross-company role creation", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.create"],
    });

    const response = await request(app)
      .post(`/api/v1/companies/${fixture.otherCompany._id}/roles`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        name: "Other Company Role",
        code: "OTHER_COMPANY_ROLE",
        scopeType: "COMPANY",
        permissionIds: [],
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("allows authorized role creation within the assigned company", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.create"],
    });

    const response = await request(app)
      .post(`/api/v1/companies/${fixture.company._id}/roles`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        name: "Project Coordinator",
        code: "PROJECT_COORDINATOR",
        description: "Coordinates project activities.",
        scopeType: "COMPANY",
        permissionIds: [],
        status: "ACTIVE",
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    const createdRole = await Role.findOne({
      companyId: fixture.company._id,
      code: "PROJECT_COORDINATOR",
      isDeleted: false,
    });

    expect(createdRole).not.toBeNull();
    expect(createdRole.scopeType).toBe("COMPANY");
    expect(createdRole.permissionIds).toHaveLength(0);
  });

  it("allows authorized updates to an eligible role", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.update"],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.targetRole._id}`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        name: "Updated Target Role",
        description: "Updated through an authorized HTTP request.",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedRole = await Role.findById(fixture.targetRole._id);

    expect(updatedRole.name).toBe("Updated Target Role");
    expect(updatedRole.description).toBe(
      "Updated through an authorized HTTP request.",
    );
  });

  it("rejects assigning permissions the actor does not possess", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.update"],
    });

    const restrictedPermission = await Permission.findOne({
      code: "role.delete",
    });

    expect(restrictedPermission).not.toBeNull();

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.targetRole._id}/permissions`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        permissionIds: [restrictedPermission._id.toString()],
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    const unchangedRole = await Role.findById(fixture.targetRole._id);

    expect(unchangedRole.permissionIds).toHaveLength(0);
  });

  it("allows assigning permissions already possessed by the actor", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.update", "role.read"],
    });

    const assignablePermission = await Permission.findOne({
      code: "role.read",
    });

    expect(assignablePermission).not.toBeNull();

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.targetRole._id}/permissions`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        permissionIds: [assignablePermission._id.toString()],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedRole = await Role.findById(fixture.targetRole._id);

    expect(
      updatedRole.permissionIds.map((permissionId) => permissionId.toString()),
    ).toContain(assignablePermission._id.toString());
  });

  it("allows authorized deactivation of an eligible role", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.update"],
    });

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.targetRole._id}/status`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        status: "INACTIVE",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedRole = await Role.findById(fixture.targetRole._id);

    expect(updatedRole.status).toBe("INACTIVE");

    const actorRole = await Role.findById(fixture.actorRole._id);

    expect(actorRole.status).toBe("ACTIVE");
  });

  it("allows authorized soft deletion of an eligible role", async () => {
    const fixture = await createFixture({
      permissionCodes: ["role.delete"],
    });

    const response = await request(app)
      .delete(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.targetRole._id}`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const deletedRole = await Role.findById(fixture.targetRole._id);

    expect(deletedRole).not.toBeNull();
    expect(deletedRole.isDeleted).toBe(true);
    expect(deletedRole.deletedAt).not.toBeNull();

    const actorRole = await Role.findById(fixture.actorRole._id);

    expect(actorRole.isDeleted).toBe(false);
  });

  it("allows Company Administrator to update own protected role permissions through HTTP", async () => {
    const requiredCodes = [
      "role.read",
      "role.update",
      "role.permission_delegate",
      "permission.read",
    ];

    const fixture = await createFixture({
      permissionCodes: requiredCodes,
    });

    const requiredPermissions = await Permission.find({
      code: { $in: requiredCodes },
    });

    const additionalPermission = await Permission.findOne({
      code: "role.create",
    });

    await Role.updateOne(
      { _id: fixture.actorRole._id },
      {
        $set: {
          name: "Company Administrator",
          code: "COMPANY_ADMIN",
          isSystemRole: true,
          isEditable: false,
          isPermissionEditable: false,
        },
      },
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.actorRole._id}/permissions`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        permissionIds: [
          ...requiredPermissions.map((permission) => permission._id.toString()),
          additionalPermission._id.toString(),
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedRole = await Role.findById(fixture.actorRole._id);

    expect(updatedRole.permissionIds.map(String).sort()).toEqual(
      [
        ...requiredPermissions.map((permission) => permission._id.toString()),
        additionalPermission._id.toString(),
      ].sort(),
    );

    expect(updatedRole.isSystemRole).toBe(true);
    expect(updatedRole.isEditable).toBe(false);
    expect(updatedRole.isPermissionEditable).toBe(false);
  });

  it("prevents Company Administrator self-lockout through HTTP", async () => {
    const requiredCodes = [
      "role.read",
      "role.update",
      "role.permission_delegate",
      "permission.read",
    ];

    const fixture = await createFixture({
      permissionCodes: requiredCodes,
    });

    await Role.updateOne(
      { _id: fixture.actorRole._id },
      {
        $set: {
          name: "Company Administrator",
          code: "COMPANY_ADMIN",
          isSystemRole: true,
          isEditable: false,
          isPermissionEditable: false,
        },
      },
    );

    const originalRole = await Role.findById(fixture.actorRole._id);
    const originalIds = originalRole.permissionIds.map(String).sort();

    const roleReadPermission = await Permission.findOne({
      code: "role.read",
    });

    const remainingIds = originalIds.filter(
      (id) => id !== roleReadPermission._id.toString(),
    );

    const response = await request(app)
      .patch(
        `/api/v1/companies/${fixture.company._id}/roles/${fixture.actorRole._id}/permissions`,
      )
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        permissionIds: remainingIds,
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    const unchangedRole = await Role.findById(fixture.actorRole._id);

    expect(unchangedRole.permissionIds.map(String).sort()).toEqual(originalIds);
  });
});
