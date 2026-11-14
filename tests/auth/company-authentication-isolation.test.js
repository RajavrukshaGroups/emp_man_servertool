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

describe("Company authentication role isolation", () => {
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

  it("rejects a company session whose assigned role belongs to another company", async () => {
    const companyA = await Company.create({
      name: "Authentication Company A",
      code: "AUTHCOMPANYA",
      slug: "auth-company-a",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const companyB = await Company.create({
      name: "Authentication Company B",
      code: "AUTHCOMPANYB",
      slug: "auth-company-b",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      name: "Role Read",
      code: "role.read",
      module: "role",
      action: "read",
      status: "ACTIVE",
    });

    const foreignRole = await Role.create({
      companyId: companyB._id,
      name: "Foreign Company Role",
      code: "FOREIGN_COMPANY_ROLE",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Authentication",
      lastName: "Tester",
      email: "authentication.isolation@example.com",
      password: "TestPassword@12345",
      passwordSetupStatus: "COMPLETED",
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

    const access = await CompanyAccess.create({
      userId: user._id,
      companyId: companyA._id,
      roleId: foreignRole._id,
      status: "ACTIVE",
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: access._id,
      companyId: companyA._id,
      roleId: foreignRole._id,
    });

    const response = await request(app)
      .get(`/api/v1/companies/${companyA._id}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it("allows a company session when its assigned role belongs to the same company", async () => {
    const company = await Company.create({
      name: "Valid Authentication Company",
      code: "VALIDAUTHCOMPANY",
      slug: "valid-authentication-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      name: "Role Read",
      code: "role.read",
      module: "role",
      action: "read",
      status: "ACTIVE",
    });

    const role = await Role.create({
      companyId: company._id,
      name: "Valid Company Role",
      code: "VALID_COMPANY_ROLE",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Valid",
      lastName: "Authentication",
      email: "valid.authentication@example.com",
      password: "TestPassword@12345",
      passwordSetupStatus: "COMPLETED",
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

    const access = await CompanyAccess.create({
      userId: user._id,
      companyId: company._id,
      roleId: role._id,
      status: "ACTIVE",
    });

    const token = generateAccessToken({
      userId: user._id,
      accessType: "COMPANY",
      companyAccessId: access._id,
      companyId: company._id,
      roleId: role._id,
    });

    const response = await request(app)
      .get(`/api/v1/companies/${company._id}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

});
