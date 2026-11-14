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
import { PERMISSIONS } from "../../src/constants/permissions.constants.js";

describe("CompanyAccess creation authorization", () => {
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
    actorScope = "COMPANY",
    targetScope = "COMPANY",
    crossCompany = false,
    selfAssignment = false,
  } = {}) => {
    const company = await Company.create({
      name: "Creation Authorization Company",
      code: "CRAUTH",
      slug: "creation-authorization-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const otherCompany = crossCompany
      ? await Company.create({
          name: "Other Authorization Company",
          code: "OTHRAUTH",
          slug: "other-authorization-company",
          timezone: "Asia/Kolkata",
          status: "ACTIVE",
        })
      : null;

    const allCodes = [...new Set([...permissions, ...targetRolePermissions])];

    const permissionDocs = await Promise.all(
      allCodes.map((code) => {
        const [module, action] = code.split(".");
        return Permission.create({
          code,
          module,
          action,
          name: code,
          status: "ACTIVE",
        });
      }),
    );

    const permissionIdsFor = (codes) =>
      permissionDocs
        .filter((permission) => codes.includes(permission.code))
        .map((permission) => permission._id);

    const actorRole = await Role.create({
      companyId: company._id,
      name: "Custom Creation Manager",
      code: "CUSTOM_CREATION_MANAGER",
      scopeType: actorScope,
      permissionIds: permissionIdsFor(permissions),
      status: "ACTIVE",
    });

    const targetRole = await Role.create({
      companyId: otherCompany?._id ?? company._id,
      name: "Custom Target Role",
      code: "CUSTOM_TARGET_ROLE",
      scopeType: targetScope,
      permissionIds: permissionIdsFor(targetRolePermissions),
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Creation",
      lastName: "Actor",
      email: "creation.actor@example.com",
      password: "Actor@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const target = selfAssignment
      ? actor
      : await User.create({
          firstName: "Creation",
          lastName: "Target",
          email: "creation.target@example.com",
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

    return { company, actor, target, actorAccess, targetRole, token };
  };

  const createAccess = ({ company, target, targetRole, token }) =>
    request(app)
      .post(`/api/v1/companies/${company._id}/access`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        userId: target._id.toString(),
        roleId: targetRole._id.toString(),
      });

  it("rejects creation without required permissions", async () => {
    const fixture = await createFixture();
    const response = await createAccess(fixture);

    expect(response.status).toBe(403);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });

  it("rejects creation when employee.create is missing", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN],
    });

    const response = await createAccess(fixture);

    expect(response.status).toBe(403);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });

  it("rejects creation when role assignment permission is missing", async () => {
    const fixture = await createFixture({
      permissions: [PERMISSIONS.EMPLOYEE_CREATE],
    });

    const response = await createAccess(fixture);

    expect(response.status).toBe(403);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });

  it("allows an authorized actor to create eligible company access", async () => {
    const fixture = await createFixture({
      permissions: [
        PERMISSIONS.EMPLOYEE_CREATE,
        PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      ],
    });

    const response = await createAccess(fixture);

    expect(response.status).toBe(201);

    const created = await CompanyAccess.findOne({
      companyId: fixture.company._id,
      userId: fixture.target._id,
      isDeleted: false,
    });

    expect(created).not.toBeNull();
    expect(String(created.roleId)).toBe(String(fixture.targetRole._id));
  });

  it("rejects assigning a role from another company", async () => {
    const fixture = await createFixture({
      permissions: [
        PERMISSIONS.EMPLOYEE_CREATE,
        PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      ],
      crossCompany: true,
    });

    const response = await createAccess(fixture);

    expect(response.status).not.toBe(201);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });

  it("rejects assigning a role above the actor's scope", async () => {
    const fixture = await createFixture({
      permissions: [
        PERMISSIONS.EMPLOYEE_CREATE,
        PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      ],
      actorScope: "TEAM",
      targetScope: "COMPANY",
    });

    const response = await createAccess(fixture);

    expect(response.status).toBe(403);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });

  it("rejects delegation of permissions the actor does not possess", async () => {
    const fixture = await createFixture({
      permissions: [
        PERMISSIONS.EMPLOYEE_CREATE,
        PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      ],
      targetRolePermissions: [PERMISSIONS.ADMIN_CREATE],
    });

    const response = await createAccess(fixture);

    expect(response.status).toBe(403);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });

  it("rejects creating another access assignment for the actor", async () => {
    const fixture = await createFixture({
      permissions: [
        PERMISSIONS.EMPLOYEE_CREATE,
        PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      ],
      selfAssignment: true,
    });

    const response = await createAccess(fixture);

    expect(response.status).not.toBe(201);
    expect(await CompanyAccess.countDocuments()).toBe(1);
  });
});
