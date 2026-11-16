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
import PlatformAccess from "../../src/modules/platform-access/platformAccess.model.js";
import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Platform Access authorization", () => {
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

  const createActor = async ({
    accessType = "GLOBAL",
    permissions = [],
    accessStatus = "ACTIVE",
  } = {}) => {
    const company =
      accessType === "COMPANY"
        ? await Company.create({
            name: "Platform Authorization Test Company",
            code: "PATC",
            slug: "platform-authorization-test-company",
            timezone: "Asia/Kolkata",
            status: "ACTIVE",
          })
        : null;

    const permissionDocuments = await Promise.all(
      permissions.map((code) => {
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

    const role = await Role.create({
      companyId: company?._id ?? null,
      name: "Custom Authorization Test Role",
      code: "CUSTOM_AUTH_TEST",
      scopeType: accessType === "GLOBAL" ? "GLOBAL" : "COMPANY",
      permissionIds: permissionDocuments.map((permission) => permission._id),
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Platform",
      lastName: "Tester",
      email: "platform.tester@example.com",
      password: "Tester@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const access =
      accessType === "GLOBAL"
        ? await PlatformAccess.create({
            userId: user._id,
            roleId: role._id,
            status: accessStatus,
          })
        : await CompanyAccess.create({
            userId: user._id,
            companyId: company._id,
            roleId: role._id,
            status: accessStatus,
          });

    await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date(Date.now() - 60_000) } });

    const token = generateAccessToken({
      userId: user._id,
      accessType,
      ...(accessType === "GLOBAL"
        ? { platformAccessId: access._id }
        : {
            companyAccessId: access._id,
            companyId: company._id,
          }),
      roleId: role._id,
    });

    return { user, role, access, company, token };
  };

  it("allows a GLOBAL actor with admin.read using a custom role code", async () => {
    const { token } = await createActor({
      permissions: ["admin.read"],
    });

    const response = await request(app)
      .get("/api/v1/platform/admins")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("rejects a COMPANY actor even when assigned admin.read", async () => {
    const { token } = await createActor({
      accessType: "COMPANY",
      permissions: ["admin.read"],
    });

    const response = await request(app)
      .get("/api/v1/platform/admins")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects a GLOBAL actor without admin.read", async () => {
    const { token } = await createActor();

    const response = await request(app)
      .get("/api/v1/platform/admins")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("allows a GLOBAL actor with role.read to list platform roles", async () => {
    const { token } = await createActor({
      permissions: ["role.read"],
    });

    const response = await request(app)
      .get("/api/v1/platform/roles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("rejects a GLOBAL actor without role.read", async () => {
    const { token } = await createActor({
      permissions: ["admin.read"],
    });

    const response = await request(app)
      .get("/api/v1/platform/roles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects inactive PlatformAccess even with admin.read", async () => {
    const { token } = await createActor({
      permissions: ["admin.read"],
      accessStatus: "INACTIVE",
    });

    const response = await request(app)
      .get("/api/v1/platform/admins")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects requests without authentication", async () => {
    const response = await request(app).get("/api/v1/platform/admins");

    expect(response.status).toBe(401);
  });
});
