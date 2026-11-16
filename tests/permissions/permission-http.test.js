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

describe("Permission catalog HTTP authorization", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);

    await Promise.all(
      collections.map((collection) => collection.deleteMany({})),
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
      name: "Permission HTTP Company",
      code: "PERMHTTP",
      slug: "permission-http-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      name: "Read Permission Catalog",
      code: "permission.read",
      module: "permission",
      action: "read",
      status: "ACTIVE",
    });

    const role = await Role.create({
      companyId: company._id,
      name: "Custom Permission Test Role",
      code: "CUSTOM_PERMISSION_TEST",
      scopeType: "COMPANY",
      permissionIds: permissionCodes.includes("permission.read")
        ? [permission._id]
        : [],
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Permission",
      lastName: "Tester",
      email: "permission.http.tester@example.com",
      password: "TestPassword@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      userId: user._id,
      companyId: company._id,
      roleId: role._id,
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
      roleId: role._id,
    });

    return { accessToken };
  };

  const endpoints = ["/api/v1/permissions", "/api/v1/permissions/grouped"];

  for (const endpoint of endpoints) {
    it(`rejects unauthenticated requests to ${endpoint}`, async () => {
      const response = await request(app).get(endpoint);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it(`rejects requests without permission.read to ${endpoint}`, async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .get(endpoint)
        .set("Authorization", `Bearer ${fixture.accessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it(`allows requests with permission.read to ${endpoint}`, async () => {
      const fixture = await createFixture({
        permissionCodes: ["permission.read"],
      });

      const response = await request(app)
        .get(endpoint)
        .set("Authorization", `Bearer ${fixture.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  }
});
