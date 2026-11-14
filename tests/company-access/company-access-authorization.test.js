import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import app from "../../src/app.js";
import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("CompanyAccess role assignment authorization", () => {
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

  it("rejects role assignment without permission and preserves the existing role", async () => {
    const company = await Company.create({
      name: "CompanyAccess Authorization Test",
      code: "CAUT",
      slug: "company-access-authorization-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const existingRole = await Role.create({
      companyId: company._id,
      name: "Basic Access",
      code: "BASIC_ACCESS",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const newRole = await Role.create({
      companyId: company._id,
      name: "Elevated Access",
      code: "ELEVATED_ACCESS",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Test",
      lastName: "Actor",
      email: "companyaccess.actor@example.com",
      password: "Actor@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const target = await User.create({
      firstName: "Test",
      lastName: "Target",
      email: "companyaccess.target@example.com",
      password: "Target@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const actorAccess = await CompanyAccess.create({
      userId: actor._id,
      companyId: company._id,
      roleId: existingRole._id,
      status: "ACTIVE",
    });

    const targetAccess = await CompanyAccess.create({
      userId: target._id,
      companyId: company._id,
      roleId: existingRole._id,
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
      roleId: existingRole._id,
    });

    const response = await request(app)
      .patch(`/api/v1/companies/${company._id}/access/${targetAccess._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: newRole._id.toString() });

    expect(response.status).toBe(403);

    const generalUpdateResponse = await request(app)
      .patch(`/api/v1/companies/${company._id}/access/${targetAccess._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: newRole._id.toString() });

    expect(generalUpdateResponse.status).toBe(403);

    const unchanged = await CompanyAccess.findById(targetAccess._id);
    expect(unchanged.roleId.toString()).toBe(existingRole._id.toString());
  });
  it("prevents an authorized actor from changing their own role", async () => {
    const { default: Permission } = await import(
      "../../src/modules/permissions/permission.model.js"
    );
    const { PERMISSIONS } = await import(
      "../../src/constants/permissions.constants.js"
    );

    const company = await Company.create({
      name: "Self Assignment Test",
      code: "SELF",
      slug: "self-assignment-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      code: PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      name: "Assign Company Access Roles",
      module: "company_access",
      action: "role_assign",
      status: "ACTIVE",
    });

    const actorRole = await Role.create({
      companyId: company._id,
      name: "Role Manager",
      code: "ROLE_MANAGER",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const proposedRole = await Role.create({
      companyId: company._id,
      name: "Proposed Role",
      code: "PROPOSED_ROLE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Self",
      lastName: "Assignment",
      email: "self.assignment@example.com",
      password: "Actor@12345",
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

    const response = await request(app)
      .patch(`/api/v1/companies/${company._id}/access/${actorAccess._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: proposedRole._id.toString() });

    expect(response.status).toBe(403);

    const unchanged = await CompanyAccess.findById(actorAccess._id);
    expect(unchanged.roleId.toString()).toBe(actorRole._id.toString());
  });
  it("allows an authorized company-scoped actor to assign an eligible role", async () => {
    const { default: Permission } = await import(
      "../../src/modules/permissions/permission.model.js"
    );
    const { PERMISSIONS } = await import(
      "../../src/constants/permissions.constants.js"
    );

    const company = await Company.create({
      name: "Authorized Assignment Test",
      code: "AUTH",
      slug: "authorized-assignment-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      code: PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN,
      name: "Assign Company Access Roles",
      module: "company_access",
      action: "role_assign",
      status: "ACTIVE",
    });

    const actorRole = await Role.create({
      companyId: company._id,
      name: "Assignment Manager",
      code: "ASSIGNMENT_MANAGER",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const existingRole = await Role.create({
      companyId: company._id,
      name: "Existing Role",
      code: "EXISTING_ROLE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const proposedRole = await Role.create({
      companyId: company._id,
      name: "Eligible Role",
      code: "ELIGIBLE_ROLE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Authorized",
      lastName: "Actor",
      email: "authorized.actor@example.com",
      password: "Actor@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const target = await User.create({
      firstName: "Authorized",
      lastName: "Target",
      email: "authorized.target@example.com",
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
      roleId: existingRole._id,
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

    const url = `/api/v1/companies/${company._id}/access/${targetAccess._id}`;

    const dedicatedResponse = await request(app)
      .patch(`${url}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: proposedRole._id.toString() });

    expect(dedicatedResponse.status).toBe(200);

    let updated = await CompanyAccess.findById(targetAccess._id);
    expect(updated.roleId.toString()).toBe(proposedRole._id.toString());

    const generalResponse = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleId: existingRole._id.toString() });

    expect(generalResponse.status).toBe(200);

    updated = await CompanyAccess.findById(targetAccess._id);
    expect(updated.roleId.toString()).toBe(existingRole._id.toString());
  });
  it("prevents a team-scoped actor from changing an existing company-scoped role", async () => {
    const { ensureCompanyAccessRoleAssignmentAllowed } = await import(
      "../../src/modules/company-access/companyAccessRoleAuthorization.js"
    );
    const { PERMISSIONS } = await import(
      "../../src/constants/permissions.constants.js"
    );

    const company = await Company.create({
      name: "Scope Protection Test",
      code: "SCOP",
      slug: "scope-protection-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const existingRole = await Role.create({
      companyId: company._id,
      name: "Existing Company Scope",
      code: "EXISTING_COMPANY_SCOPE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const proposedRole = await Role.create({
      companyId: company._id,
      name: "Proposed Team Scope",
      code: "PROPOSED_TEAM_SCOPE",
      scopeType: "TEAM",
      permissionIds: [],
      status: "ACTIVE",
    });

    const actorId = new mongoose.Types.ObjectId();
    const actorAccessId = new mongoose.Types.ObjectId();
    const targetUserId = new mongoose.Types.ObjectId();

    await expect(
      ensureCompanyAccessRoleAssignmentAllowed({
        companyId: company._id,
        targetAccess: {
          userId: targetUserId,
          companyId: company._id,
          roleId: existingRole._id,
        },
        proposedRole,
        actorContext: {
          userId: actorId,
          accessType: "COMPANY",
          companyId: company._id,
          companyAccessId: actorAccessId,
          companyAccess: { _id: actorAccessId },
          roleScopeType: "TEAM",
          permissionCodes: [PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN],
        },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
