import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import {
  createRole,
  updateRole,
  updateRolePermissions,
  updateRoleStatus,
  softDeleteRole,
} from "../../src/modules/roles/role.service.js";

describe("Role self-modification authorization", () => {
  const companyId = new mongoose.Types.ObjectId();
  const actorId = new mongoose.Types.ObjectId();
  const ownRoleId = new mongoose.Types.ObjectId();

  const operations = [
    {
      name: "update role details",
      execute: (actorRoleId) =>
        updateRole(
          companyId,
          ownRoleId,
          { name: "Modified Role" },
          actorId,
          actorRoleId,
        ),
    },
    {
      name: "update role permissions",
      execute: (actorRoleId) =>
        updateRolePermissions(companyId, ownRoleId, [], actorId, actorRoleId),
    },
    {
      name: "change role status",
      execute: (actorRoleId) =>
        updateRoleStatus(
          companyId,
          ownRoleId,
          "INACTIVE",
          actorId,
          actorRoleId,
        ),
    },
    {
      name: "delete role",
      execute: (actorRoleId) =>
        softDeleteRole(companyId, ownRoleId, actorId, actorRoleId),
    },
  ];

  for (const operation of operations) {
    it(`rejects attempts to ${operation.name} on the actor's own role`, async () => {
      await expect(operation.execute(ownRoleId)).rejects.toMatchObject({
        statusCode: 403,
        message: "You cannot modify your own assigned role.",
      });
    });

    it(`rejects missing role context when attempting to ${operation.name}`, async () => {
      await expect(operation.execute(null)).rejects.toMatchObject({
        statusCode: 403,
        message: "Authenticated role context is required.",
      });
    });
  }
});

import { afterAll, afterEach, beforeAll } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import Role from "../../src/modules/roles/role.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";

describe("Role management integration authorization", () => {
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
      name: "Test Company",
      code: "TESTCO",
      slug: "test-company",
    });

    const otherCompany = await Company.create({
      name: "Other Company",
      code: "OTHERCO",
      slug: "other-company",
    });

    const actorRole = await Role.create({
      companyId: company._id,
      name: "Managing Role",
      code: "MANAGING_ROLE",
      scopeType: "COMPANY",
    });

    const targetRole = await Role.create({
      companyId: company._id,
      name: "Target Role",
      code: "TARGET_ROLE",
      scopeType: "COMPANY",
    });

    const otherCompanyRole = await Role.create({
      companyId: otherCompany._id,
      name: "External Role",
      code: "EXTERNAL_ROLE",
      scopeType: "COMPANY",
    });

    const actorId = new mongoose.Types.ObjectId();

    return {
      company,
      actorRole,
      targetRole,
      otherCompanyRole,
      actorId,
    };
  };

  it("rejects GLOBAL-only permissions during company role creation even with delegation", async () => {
    const fixture = await createFixture();

    const globalPermission = await Permission.create({
      name: "Create Companies",
      code: "company.create",
      module: "company",
      action: "create",
      applicability: "GLOBAL",
      status: "ACTIVE",
    });

    await expect(
      createRole(
        fixture.company._id,
        {
          name: "Unsafe Role",
          code: "UNSAFE_ROLE",
          scopeType: "COMPANY",
          permissionIds: [globalPermission._id],
        },
        fixture.actorId,
        {
          roleScopeType: "COMPANY",
          permissionCodes: ["role.create", "role.permission_delegate"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("Platform-only permissions"),
    });

    const unsafeRole = await Role.findOne({
      companyId: fixture.company._id,
      code: "UNSAFE_ROLE",
    });

    expect(unsafeRole).toBeNull();
  });

  it("rejects GLOBAL-only permission updates even with delegation", async () => {
    const fixture = await createFixture();

    const globalPermission = await Permission.create({
      name: "Update Companies",
      code: "company.update",
      module: "company",
      action: "update",
      applicability: "GLOBAL",
      status: "ACTIVE",
    });

    await expect(
      updateRolePermissions(
        fixture.company._id,
        fixture.targetRole._id,
        [globalPermission._id],
        fixture.actorId,
        fixture.actorRole._id,
        {
          roleScopeType: "COMPANY",
          permissionCodes: ["role.update", "role.permission_delegate"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("Platform-only permissions"),
    });

    const unchangedRole = await Role.findById(fixture.targetRole._id);

    expect(unchangedRole.permissionIds).toHaveLength(0);
  });

  it("allows updating another editable role", async () => {
    const fixture = await createFixture();

    const result = await updateRole(
      fixture.company._id,
      fixture.targetRole._id,
      { name: "Updated Target Role" },
      fixture.actorId,
      fixture.actorRole._id,
      {
        roleScopeType: "COMPANY",
        permissionCodes: ["role.update"],
      },
    );

    expect(result.name).toBe("Updated Target Role");
  });

  it("allows updating another permission-editable role", async () => {
    const fixture = await createFixture();

    const permission = await Permission.create({
      name: "Read Test Records",
      code: "test.read",
      module: "test",
      action: "read",
      status: "ACTIVE",
    });

    const result = await updateRolePermissions(
      fixture.company._id,
      fixture.targetRole._id,
      [permission._id],
      fixture.actorId,
      fixture.actorRole._id,
      {
        roleScopeType: "COMPANY",
        permissionCodes: ["role.update", "test.read"],
      },
    );

    expect(result.permissionIds.map((item) => item.code)).toContain(
      "test.read",
    );
  });

  it("preserves existing permissions the actor lacks while allowing authorized additions", async () => {
    const fixture = await createFixture();

    const existingPermission = await Permission.create({
      name: "Manage Test Records",
      code: "test.manage",
      module: "test",
      action: "manage",
      status: "ACTIVE",
    });

    const newPermission = await Permission.create({
      name: "Read Test Records",
      code: "test.read",
      module: "test",
      action: "read",
      status: "ACTIVE",
    });

    fixture.targetRole.permissionIds = [existingPermission._id];
    await fixture.targetRole.save();

    const result = await updateRolePermissions(
      fixture.company._id,
      fixture.targetRole._id,
      [existingPermission._id, newPermission._id],
      fixture.actorId,
      fixture.actorRole._id,
      {
        roleScopeType: "COMPANY",
        permissionCodes: ["role.update", "test.read"],
      },
    );

    expect(
      result.permissionIds.map((permission) => permission.code).sort(),
    ).toEqual(["test.manage", "test.read"]);

    const savedRole = await Role.findById(fixture.targetRole._id);

    expect(savedRole.permissionIds.map((id) => id.toString()).sort()).toEqual(
      [existingPermission._id.toString(), newPermission._id.toString()].sort(),
    );
  });
  it("rejects granting permissions the actor does not possess", async () => {
    const fixture = await createFixture();

    const permission = await Permission.create({
      name: "Manage Test Records",
      code: "test.manage",
      module: "test",
      action: "manage",
      status: "ACTIVE",
    });

    await expect(
      updateRolePermissions(
        fixture.company._id,
        fixture.targetRole._id,
        [permission._id],
        fixture.actorId,
        fixture.actorRole._id,
        {
          roleScopeType: "COMPANY",
          permissionCodes: ["role.update"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    const unchangedRole = await Role.findById(fixture.targetRole._id);

    expect(unchangedRole.permissionIds).toHaveLength(0);
  });

  it("rejects updates to roles belonging to another company", async () => {
    const fixture = await createFixture();

    await expect(
      updateRole(
        fixture.company._id,
        fixture.otherCompanyRole._id,
        { name: "Unauthorized Update" },
        fixture.actorId,
        fixture.actorRole._id,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("preserves protected system-role editing restrictions", async () => {
    const fixture = await createFixture();

    fixture.targetRole.isSystemRole = true;
    fixture.targetRole.isEditable = false;
    fixture.targetRole.isPermissionEditable = false;
    await fixture.targetRole.save();

    await expect(
      updateRole(
        fixture.company._id,
        fixture.targetRole._id,
        { name: "Unauthorized Update" },
        fixture.actorId,
        fixture.actorRole._id,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    await expect(
      updateRolePermissions(
        fixture.company._id,
        fixture.targetRole._id,
        [],
        fixture.actorId,
        fixture.actorRole._id,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    await expect(
      softDeleteRole(
        fixture.company._id,
        fixture.targetRole._id,
        fixture.actorId,
        fixture.actorRole._id,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects TEAM-scoped actors modifying COMPANY-scoped roles", async () => {
    const fixture = await createFixture();

    await expect(
      updateRole(
        fixture.company._id,
        fixture.targetRole._id,
        { name: "Unauthorized Scope Update" },
        fixture.actorId,
        fixture.actorRole._id,
        {
          roleScopeType: "TEAM",
          permissionCodes: ["role.update"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You cannot manage a role outside your authorized scope.",
    });

    const unchangedRole = await Role.findById(fixture.targetRole._id);

    expect(unchangedRole.name).toBe("Target Role");
  });

  it("rejects TEAM-scoped actors creating COMPANY-scoped roles", async () => {
    const fixture = await createFixture();

    await expect(
      createRole(
        fixture.company._id,
        {
          name: "Unauthorized Company Role",
          code: "UNAUTHORIZED_COMPANY_ROLE",
          scopeType: "COMPANY",
          permissionIds: [],
          status: "ACTIVE",
        },
        fixture.actorId,
        {
          roleScopeType: "TEAM",
          permissionCodes: ["role.create"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You cannot manage a role outside your authorized scope.",
    });

    const unauthorizedRole = await Role.findOne({
      companyId: fixture.company._id,
      code: "UNAUTHORIZED_COMPANY_ROLE",
    });

    expect(unauthorizedRole).toBeNull();
  });

  it("rejects creating roles with permissions the actor does not possess", async () => {
    const fixture = await createFixture();

    const permission = await Permission.create({
      name: "Manage Test Records",
      code: "test.manage",
      module: "test",
      action: "manage",
      status: "ACTIVE",
    });

    await expect(
      createRole(
        fixture.company._id,
        {
          name: "Unauthorized Permission Role",
          code: "UNAUTHORIZED_PERMISSION_ROLE",
          scopeType: "COMPANY",
          permissionIds: [permission._id],
          status: "ACTIVE",
        },
        fixture.actorId,
        {
          roleScopeType: "COMPANY",
          permissionCodes: ["role.create"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    const unauthorizedRole = await Role.findOne({
      companyId: fixture.company._id,
      code: "UNAUTHORIZED_PERMISSION_ROLE",
    });

    expect(unauthorizedRole).toBeNull();
  });

  it("allows authorized permission delegation during role creation", async () => {
    const fixture = await createFixture();

    const permission = await Permission.create({
      name: "Manage Test Records",
      code: "test.manage",
      module: "test",
      action: "manage",
      status: "ACTIVE",
    });

    const createdRole = await createRole(
      fixture.company._id,
      {
        name: "Delegated Permission Role",
        code: "DELEGATED_PERMISSION_ROLE",
        scopeType: "COMPANY",
        permissionIds: [permission._id],
        status: "ACTIVE",
      },
      fixture.actorId,
      {
        roleScopeType: "COMPANY",
        permissionCodes: ["role.create", "role.permission_delegate"],
      },
    );

    expect(createdRole).toBeTruthy();
    expect(createdRole.permissionIds.map((item) => item.code)).toContain(
      "test.manage",
    );

    const savedRole = await Role.findById(createdRole._id);

    expect(savedRole).not.toBeNull();
    expect(savedRole.companyId.toString()).toBe(fixture.company._id.toString());
  });

  it("rejects scope escalation even with permission delegation authority", async () => {
    const fixture = await createFixture();

    const permission = await Permission.create({
      name: "Manage Test Records",
      code: "test.manage",
      module: "test",
      action: "manage",
      status: "ACTIVE",
    });

    await expect(
      createRole(
        fixture.company._id,
        {
          name: "Escalated Delegated Role",
          code: "ESCALATED_DELEGATED_ROLE",
          scopeType: "COMPANY",
          permissionIds: [permission._id],
          status: "ACTIVE",
        },
        fixture.actorId,
        {
          roleScopeType: "TEAM",
          permissionCodes: ["role.create", "role.permission_delegate"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You cannot manage a role outside your authorized scope.",
    });

    const unauthorizedRole = await Role.findOne({
      companyId: fixture.company._id,
      code: "ESCALATED_DELEGATED_ROLE",
    });

    expect(unauthorizedRole).toBeNull();
  });

  it("rejects permission updates to roles belonging to another company", async () => {
    const fixture = await createFixture();

    const permission = await Permission.create({
      name: "Read Test Records",
      code: "test.read",
      module: "test",
      action: "read",
      status: "ACTIVE",
    });

    await expect(
      updateRolePermissions(
        fixture.company._id,
        fixture.otherCompanyRole._id,
        [permission._id],
        fixture.actorId,
        fixture.actorRole._id,
        {
          roleScopeType: "COMPANY",
          permissionCodes: ["role.update", "test.read"],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const unchangedRole = await Role.findById(fixture.otherCompanyRole._id);

    expect(unchangedRole).not.toBeNull();
    expect(unchangedRole.permissionIds).toHaveLength(0);
  });

  it("allows an authorized Company Administrator to update their own protected role permissions", async () => {
    const fixture = await createFixture();

    const permissionDefinitions = [
      ["role.read", "role", "read"],
      ["role.update", "role", "update"],
      ["role.permission_delegate", "role", "permission_delegate"],
      ["permission.read", "permission", "read"],
      ["test.read", "test", "read"],
    ];

    const permissions = await Permission.insertMany(
      permissionDefinitions.map(([code, module, action]) => ({
        name: code,
        code,
        module,
        action,
        status: "ACTIVE",
      })),
    );

    const permissionIds = permissions.map((permission) => permission._id);

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Company Administrator",
      code: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      isSystemRole: true,
      isEditable: false,
      isPermissionEditable: false,
      permissionIds: permissionIds.slice(0, 4),
    });

    const result = await updateRolePermissions(
      fixture.company._id,
      adminRole._id,
      permissionIds,
      fixture.actorId,
      adminRole._id,
      {
        roleScopeType: "COMPANY",
        permissionCodes: [
          "role.read",
          "role.update",
          "role.permission_delegate",
          "permission.read",
        ],
      },
    );

    expect(
      result.permissionIds.map((permission) => permission.code).sort(),
    ).toEqual(permissionDefinitions.map(([code]) => code).sort());

    const savedRole = await Role.findById(adminRole._id);

    expect(savedRole.isSystemRole).toBe(true);
    expect(savedRole.isEditable).toBe(false);
    expect(savedRole.isPermissionEditable).toBe(false);
    expect(savedRole.permissionIds).toHaveLength(5);
  });

  it("prevents Company Administrator self-lockout by removing mandatory permissions", async () => {
    const fixture = await createFixture();

    const requiredCodes = [
      "role.read",
      "role.update",
      "role.permission_delegate",
      "permission.read",
    ];

    const permissions = await Permission.insertMany(
      requiredCodes.map((code) => ({
        name: code,
        code,
        module: code.split(".")[0],
        action: code.split(".").slice(1).join("."),
        status: "ACTIVE",
      })),
    );

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Company Administrator",
      code: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      isSystemRole: true,
      isEditable: false,
      isPermissionEditable: false,
      permissionIds: permissions.map((permission) => permission._id),
    });

    const originalIds = adminRole.permissionIds.map(String).sort();

    for (const removedPermission of permissions) {
      const remainingIds = permissions
        .filter(
          (permission) =>
            permission._id.toString() !== removedPermission._id.toString(),
        )
        .map((permission) => permission._id);

      await expect(
        updateRolePermissions(
          fixture.company._id,
          adminRole._id,
          remainingIds,
          fixture.actorId,
          adminRole._id,
          {
            roleScopeType: "COMPANY",
            permissionCodes: requiredCodes,
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining(
          "Required Company Administrator permissions cannot be removed",
        ),
      });

      const unchangedRole = await Role.findById(adminRole._id);

      expect(unchangedRole.permissionIds.map(String).sort()).toEqual(
        originalIds,
      );
    }
  });

  it("prevents another role from editing protected Company Administrator permissions even with delegation", async () => {
    const fixture = await createFixture();

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Company Administrator",
      code: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      isSystemRole: true,
      isEditable: false,
      isPermissionEditable: false,
      permissionIds: [],
    });

    await expect(
      updateRolePermissions(
        fixture.company._id,
        adminRole._id,
        [],
        fixture.actorId,
        fixture.actorRole._id,
        {
          roleScopeType: "COMPANY",
          permissionCodes: [
            "role.update",
            "role.permission_delegate",
            "permission.read",
          ],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining(
        "Permissions of this role are protected",
      ),
    });

    const unchangedRole = await Role.findById(adminRole._id);

    expect(unchangedRole.permissionIds).toHaveLength(0);
    expect(unchangedRole.isPermissionEditable).toBe(false);
  });

  it("rejects GLOBAL-only permissions during Company Administrator self-edit", async () => {
    const fixture = await createFixture();

    const permissionDefinitions = [
      ["role.read", "role", "read", "COMPANY"],
      ["role.update", "role", "update", "COMPANY"],
      ["role.permission_delegate", "role", "permission_delegate", "COMPANY"],
      ["permission.read", "permission", "read", "COMPANY"],
      ["company.create", "company", "create", "GLOBAL"],
    ];

    const permissions = await Permission.insertMany(
      permissionDefinitions.map(([code, module, action, applicability]) => ({
        name: code,
        code,
        module,
        action,
        applicability,
        status: "ACTIVE",
      })),
    );

    const requiredPermissionIds = permissions
      .filter((permission) => permission.code !== "company.create")
      .map((permission) => permission._id);

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Company Administrator",
      code: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      isSystemRole: true,
      isEditable: false,
      isPermissionEditable: false,
      permissionIds: requiredPermissionIds,
    });

    await expect(
      updateRolePermissions(
        fixture.company._id,
        adminRole._id,
        permissions.map((permission) => permission._id),
        fixture.actorId,
        adminRole._id,
        {
          roleScopeType: "COMPANY",
          permissionCodes: [
            "role.read",
            "role.update",
            "role.permission_delegate",
            "permission.read",
          ],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining(
        "Platform-only permissions cannot be assigned",
      ),
    });

    const unchangedRole = await Role.findById(adminRole._id);

    expect(unchangedRole.permissionIds.map(String).sort()).toEqual(
      requiredPermissionIds.map(String).sort(),
    );
  });
});
