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

describe("Company Administrator HTTP authorization", () => {
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
  } = {}) => {
    const company = await Company.create({
      name: "Company Administrator Authorization Test",
      code: "CAAT",
      slug: "company-administrator-authorization-test",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    await Role.create({
      companyId: company._id,
      name: "Company Administrator",
      code: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
      isSystemRole: true,
    });

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
      companyId: accessType === "GLOBAL" ? null : company._id,
      name: "Custom Authorization Role",
      code: "CUSTOM_AUTHORIZATION_ROLE",
      scopeType: accessType === "GLOBAL" ? "GLOBAL" : "COMPANY",
      permissionIds: permissionDocuments.map((permission) => permission._id),
      status: "ACTIVE",
    });

    const user = await User.create({
      firstName: "Authorization",
      lastName: "Tester",
      email: "company.admin.authorization@example.com",
      password: "Tester@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const access =
      accessType === "GLOBAL"
        ? await PlatformAccess.create({
            userId: user._id,
            roleId: role._id,
            status: "ACTIVE",
          })
        : await CompanyAccess.create({
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

    return { company, token };
  };

  it("allows GLOBAL access with admin.read and a custom role code", async () => {
    const { company, token } = await createActor({
      permissions: ["admin.read"],
    });

    const response = await request(app)
      .get(`/api/v1/companies/${company._id}/administrators`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("rejects COMPANY access even with admin.read", async () => {
    const { company, token } = await createActor({
      accessType: "COMPANY",
      permissions: ["admin.read"],
    });

    const response = await request(app)
      .get(`/api/v1/companies/${company._id}/administrators`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects GLOBAL access without admin.read", async () => {
    const { company, token } = await createActor();

    const response = await request(app)
      .get(`/api/v1/companies/${company._id}/administrators`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("rejects unauthenticated requests", async () => {
    const company = await Company.create({
      name: "Unauthenticated Test Company",
      code: "UTC",
      slug: "unauthenticated-test-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const response = await request(app).get(
      `/api/v1/companies/${company._id}/administrators`,
    );

    expect(response.status).toBe(401);
  });


  it("allows an authorized GLOBAL custom role to manage the administrator lifecycle", async () => {
    const { company, token } = await createActor({
      permissions: [
        "admin.create",
        "admin.update",
        "admin.deactivate",
      ],
    });

    const url = `/api/v1/companies/${company._id}/administrators`;

    const createResponse = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${token}`)
      .send({
        firstName: "Lifecycle",
        lastName: "Administrator",
        email: "lifecycle.administrator@example.com",
        password: "InitialPassword@123",
        employeeCode: "LIFE001",
      });

    expect(createResponse.status).toBe(201);

    const administrator = await User.findOne({
      email: "lifecycle.administrator@example.com",
    });

    expect(administrator).not.toBeNull();

    const updateResponse = await request(app)
      .patch(url)
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "UpdatedLifecycle" });

    expect(updateResponse.status).toBe(200);

    const updatedUser = await User.findById(administrator._id);
    expect(updatedUser.firstName).toBe("UpdatedLifecycle");

    const resetResponse = await request(app)
      .patch(`${url}/reset-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        newPassword: "UpdatedPassword@123",
        confirmPassword: "UpdatedPassword@123",
      });

    expect(resetResponse.status).toBe(200);

    const passwordUser = await User.findById(administrator._id)
      .select("+password");

    expect(
      await passwordUser.comparePassword("UpdatedPassword@123"),
    ).toBe(true);

    const statusResponse = await request(app)
      .patch(`${url}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "INACTIVE" });

    expect(statusResponse.status).toBe(200);

    const inactiveUser = await User.findById(administrator._id);

    const inactiveAccess = await CompanyAccess.findOne({
      companyId: company._id,
      userId: administrator._id,
    });

    expect(inactiveUser.status).toBe("INACTIVE");
    expect(inactiveAccess.status).toBe("INACTIVE");
  });

  const writeOperations = [
    {
      name: "create",
      method: "post",
      suffix: "",
      permission: "admin.create",
      body: {
        firstName: "New",
        lastName: "Administrator",
        email: "new.administrator@example.com",
        password: "Tester@12345",
        employeeCode: "ADMIN001",
      },
    },
    {
      name: "update",
      method: "patch",
      suffix: "",
      permission: "admin.update",
      body: {
        firstName: "Updated",
      },
    },
    {
      name: "reset password",
      method: "patch",
      suffix: "/reset-password",
      permission: "admin.update",
      body: {
        newPassword: "NewPassword@12345",
        confirmPassword: "NewPassword@12345",
      },
    },
    {
      name: "change status",
      method: "patch",
      suffix: "/status",
      permission: "admin.deactivate",
      body: {
        status: "INACTIVE",
      },
    },
  ];


  for (const operation of writeOperations) {
    it(`rejects GLOBAL access without the required permission for ${operation.name}`, async () => {
      const { company, token } = await createActor();

      const url = `/api/v1/companies/${company._id}/administrators${operation.suffix}`;

      const response = await request(app)
        [operation.method](url)
        .set("Authorization", `Bearer ${token}`)
        .send(operation.body);

      expect(response.status).toBe(403);
    });
  }

  for (const operation of writeOperations) {
    it(`allows GLOBAL authorization for ${operation.name} with a custom role`, async () => {
      const { company, token } = await createActor({
        permissions: [operation.permission],
      });

      const url = `/api/v1/companies/${company._id}/administrators${operation.suffix}`;

      const response = await request(app)
        [operation.method](url)
        .set("Authorization", `Bearer ${token}`)
        .send(operation.body);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it(`rejects COMPANY authorization for ${operation.name}`, async () => {
      const { company, token } = await createActor({
        accessType: "COMPANY",
        permissions: [operation.permission],
      });

      const url = `/api/v1/companies/${company._id}/administrators${operation.suffix}`;

      const response = await request(app)
        [operation.method](url)
        .set("Authorization", `Bearer ${token}`)
        .send(operation.body);

      expect(response.status).toBe(403);
    });
  }

});
