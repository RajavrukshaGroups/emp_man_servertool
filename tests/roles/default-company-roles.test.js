import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import Role from "../../src/modules/roles/role.model.js";
import { provisionDefaultCompanyRoles } from "../../src/modules/roles/defaultCompanyRoles.service.js";

describe("Default company role provisioning", () => {
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
    await replicaSet.stop();
  });

  const createFixture = async () => {
    const company = await Company.create({
      name: "Provisioning Test Company",
      code: "PROVISION_TEST",
      slug: "provisioning-test-company",
    });

    const otherCompany = await Company.create({
      name: "Second Test Company",
      code: "SECOND_TEST",
      slug: "second-test-company",
    });

    // Read the default role permission codes directly from the source file
    // so tests remain aligned when new default permissions are introduced.
    const { readFile } = await import("node:fs/promises");

    const source = await readFile(
      new URL(
        "../../src/modules/roles/defaultCompanyRoles.service.js",
        import.meta.url,
      ),
      "utf8",
    );

    const permissionCodes = [
      ...new Set(
        [...source.matchAll(/"([a-z_]+\.[a-z_]+)"/g)].map((match) => match[1]),
      ),
    ];

    await Permission.insertMany(
      permissionCodes.map((code) => ({
        name: code,
        code,
        module: code.split(".")[0],
        action: code.split(".")[1],
        status: "ACTIVE",
      })),
    );

    return { company, otherCompany };
  };

  it("creates all three default company roles with permissions", async () => {
    const { company } = await createFixture();

    await provisionDefaultCompanyRoles({
      companyId: company._id,
    });

    const roles = await Role.find({
      companyId: company._id,
      isDeleted: false,
    });

    expect(roles).toHaveLength(3);

    expect(roles.map((role) => role.code).sort()).toEqual([
      "COMPANY_ADMIN",
      "EMPLOYEE",
      "TEAM_LEAD",
    ]);

    for (const role of roles) {
      expect(role.isSystemRole).toBe(true);
      expect(role.isEditable).toBe(false);
      expect(role.permissionIds.length).toBeGreaterThan(0);
    }
  });

  it("preserves customized permissions when provisioning runs again", async () => {
    const { company } = await createFixture();

    await provisionDefaultCompanyRoles({
      companyId: company._id,
    });

    const adminRole = await Role.findOne({
      companyId: company._id,
      code: "COMPANY_ADMIN",
    });

    const originalRoleId = adminRole._id;

    const customPermission = await Permission.create({
      name: "Custom Company Permission",
      code: "custom.manage",
      module: "custom",
      action: "manage",
      status: "ACTIVE",
    });

    adminRole.permissionIds = [
      ...adminRole.permissionIds,
      customPermission._id,
    ];

    await adminRole.save();

    await provisionDefaultCompanyRoles({
      companyId: company._id,
    });

    const updatedRole = await Role.findOne({
      companyId: company._id,
      code: "COMPANY_ADMIN",
    });

    expect(updatedRole._id.toString()).toBe(originalRoleId.toString());

    expect(updatedRole.permissionIds.map((id) => id.toString())).toContain(
      customPermission._id.toString(),
    );
  });

  it("does not modify roles belonging to another company", async () => {
    const { company, otherCompany } = await createFixture();

    await provisionDefaultCompanyRoles({
      companyId: otherCompany._id,
    });

    const otherCompanyRolesBefore = await Role.find({
      companyId: otherCompany._id,
    }).lean();

    await provisionDefaultCompanyRoles({
      companyId: company._id,
    });

    const otherCompanyRolesAfter = await Role.find({
      companyId: otherCompany._id,
    }).lean();

    expect(otherCompanyRolesAfter).toEqual(otherCompanyRolesBefore);
  });
});
