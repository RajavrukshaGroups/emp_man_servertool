import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Role from "../../src/modules/roles/role.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import PlatformAccess from "../../src/modules/platform-access/platformAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import User from "../../src/modules/users/user.model.js";
import Team from "../../src/modules/teams/team.model.js";

import {
  updateUser,
  updateUserStatus,
  resetPassword,
} from "../../src/modules/users/user.service.js";

import { ensureEmployeeAccountActionAllowed } from "../../src/modules/users/employeeAccountAuthorization.js";

const ACCOUNT_UPDATE = "user.employee_account_update";
const ACCOUNT_RESET = "user.employee_account_reset_password";
const ACCOUNT_STATUS = "user.employee_account_status_manage";

describe("Employee account authorization", () => {
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

  const createFixture = async ({
    targetPermissionCodes = [],
    platformAccount = false,
  } = {}) => {
    const companyId = new mongoose.Types.ObjectId();

    const actor = await User.create({
      firstName: "Test",
      lastName: "Manager",
      email: "account.manager@example.com",
      password: "Manager@12345",
      status: "ACTIVE",
    });

    const targetUser = await User.create({
      firstName: "Test",
      lastName: "Employee",
      email: "account.employee@example.com",
      password: "Employee@12345",
      status: "ACTIVE",
    });

    const actorId = actor._id;
    const targetUserId = targetUser._id;

    const permissions = await Permission.insertMany(
      targetPermissionCodes.map((code) => ({
        code,
        module: code.split(".")[0],
        action: code.split(".").slice(1).join("_"),
        name: code,
        status: "ACTIVE",
      })),
    );

    const role = await Role.create({
      companyId,
      name: "Test Account Role",
      code: "TEST_ACCOUNT_ROLE",
      scopeType: "COMPANY",
      permissionIds: permissions.map((permission) => permission._id),
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      userId: targetUserId,
      companyId,
      roleId: role._id,
      status: "ACTIVE",
    });

    await Employee.create({
      userId: targetUserId,
      companyId,
      companyAccessId: companyAccess._id,
      status: "ACTIVE",
    });

    if (platformAccount) {
      const platformRole = await Role.create({
        name: "Test Platform Role",
        code: "TEST_PLATFORM_ROLE",
        scopeType: "GLOBAL",
        status: "ACTIVE",
      });

      await PlatformAccess.create({
        userId: targetUserId,
        roleId: platformRole._id,
        status: "ACTIVE",
      });
    }

    return {
      actorId,
      targetUserId,
      context: {
        actorId,
        companyId,
        roleScopeType: "COMPANY",
        permissionCodes: [],
      },
    };
  };

  it("allows updating an eligible employee account", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_UPDATE];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "UPDATE",
      }),
    ).resolves.toBeUndefined();
  });

  it("allows password reset with the dedicated permission", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "RESET_PASSWORD",
      }),
    ).resolves.toBeUndefined();
  });

  it("allows status management with the dedicated permission", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_STATUS];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "STATUS_MANAGE",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects an actor without account management permission", async () => {
    const fixture = await createFixture();

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "UPDATE",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("protects accounts with active admin permissions", async () => {
    const fixture = await createFixture({
      targetPermissionCodes: ["admin.invitation_send"],
    });

    fixture.context.permissionCodes = [ACCOUNT_RESET];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "RESET_PASSWORD",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("protects platform accounts", async () => {
    const fixture = await createFixture({
      platformAccount: true,
    });

    fixture.context.permissionCodes = [ACCOUNT_STATUS];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "STATUS_MANAGE",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("prevents an actor from changing their own status", async () => {
    const fixture = await createFixture();

    fixture.context.actorId = fixture.targetUserId;
    fixture.context.permissionCodes = [ACCOUNT_STATUS];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "STATUS_MANAGE",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("preserves existing broad administrator authorization", async () => {
    const fixture = await createFixture({
      targetPermissionCodes: ["admin.read"],
    });

    fixture.context.permissionCodes = ["admin.update"];

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "UPDATE",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects dedicated account management without an employee profile", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];

    await Employee.deleteMany({
      userId: fixture.targetUserId,
      companyId: fixture.context.companyId,
    });

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "RESET_PASSWORD",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects dedicated account management without company context", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];
    fixture.context.companyId = null;

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "RESET_PASSWORD",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects dedicated account management across company boundaries", async () => {
    const fixture = await createFixture();

    const anotherCompanyId = new mongoose.Types.ObjectId();

    fixture.context.permissionCodes = [ACCOUNT_RESET];
    fixture.context.companyId = anotherCompanyId;

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "RESET_PASSWORD",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("updates an eligible employee through the actual user service", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_UPDATE];

    const updatedUser = await updateUser(
      fixture.targetUserId,
      {
        firstName: "Updated",
        lastName: "Employee",
      },
      fixture.context,
    );

    expect(updatedUser.firstName).toBe("Updated");
    expect(updatedUser.lastName).toBe("Employee");

    const savedUser = await User.findById(fixture.targetUserId);

    expect(savedUser.firstName).toBe("Updated");
    expect(savedUser.lastName).toBe("Employee");
  });

  it("suspends an eligible employee through the actual user service", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_STATUS];

    const updatedUser = await updateUserStatus(
      fixture.targetUserId,
      "SUSPENDED",
      fixture.context,
    );

    expect(updatedUser.status).toBe("SUSPENDED");

    const savedUser = await User.findById(fixture.targetUserId);

    expect(savedUser.status).toBe("SUSPENDED");
    expect(String(savedUser.updatedBy)).toBe(String(fixture.actorId));
  });

  it("resets an eligible employee password through the actual user service", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];

    const newPassword = "UpdatedEmployee@12345";

    const result = await resetPassword(
      fixture.targetUserId,
      newPassword,
      fixture.context,
    );

    expect(result).toBe(true);

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    // Verify that the new password works.
    expect(await savedUser.comparePassword(newPassword)).toBe(true);

    // Verify that the plaintext password was not stored.
    expect(savedUser.password).not.toBe(newPassword);

    // Verify the audit field.
    expect(String(savedUser.updatedBy)).toBe(String(fixture.actorId));
  });

  it("rejects unauthorized profile updates without modifying the employee", async () => {
    const fixture = await createFixture();

    // The actor has no account-update permission.
    fixture.context.permissionCodes = [];

    await expect(
      updateUser(
        fixture.targetUserId,
        {
          firstName: "Unauthorized",
        },
        fixture.context,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    // Verify the database was not modified.
    const savedUser = await User.findById(fixture.targetUserId);

    expect(savedUser.firstName).toBe("Test");
    expect(savedUser.status).toBe("ACTIVE");
  });

  it("rejects unauthorized suspension without changing employee status", async () => {
    const fixture = await createFixture();

    // The actor has no status-management permission.
    fixture.context.permissionCodes = [];

    await expect(
      updateUserStatus(fixture.targetUserId, "SUSPENDED", fixture.context),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    // Confirm the employee remains active.
    const savedUser = await User.findById(fixture.targetUserId);

    expect(savedUser.status).toBe("ACTIVE");
    expect(savedUser.updatedBy).toBeNull();
  });

  it("rejects unauthorized password reset without changing the password", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [];

    const unauthorizedPassword = "Unauthorized@12345";

    await expect(
      resetPassword(
        fixture.targetUserId,
        unauthorizedPassword,
        fixture.context,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    // The original password must remain valid.
    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    // The unauthorized password must not work.
    expect(await savedUser.comparePassword(unauthorizedPassword)).toBe(false);

    // The rejected operation must not update the audit field.
    expect(savedUser.updatedBy).toBeNull();
  });

  it("rejects cross-company password reset without modifying the password", async () => {
    const fixture = await createFixture();

    // The actor has the dedicated reset permission.
    fixture.context.permissionCodes = [ACCOUNT_RESET];

    // Simulate an actor operating in another company.
    fixture.context.companyId = new mongoose.Types.ObjectId();

    const newPassword = "CrossCompany@12345";

    await expect(
      resetPassword(fixture.targetUserId, newPassword, fixture.context),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    // The employee's original password must still work.
    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    // The attempted replacement password must not work.
    expect(await savedUser.comparePassword(newPassword)).toBe(false);

    expect(savedUser.updatedBy).toBeNull();
  });

  it("protects multi-company accounts with administrative access in another company", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];

    const anotherCompanyId = new mongoose.Types.ObjectId();

    const adminPermission = await Permission.create({
      code: "admin.update",
      module: "admin",
      action: "update",
      name: "Admin Update",
      status: "ACTIVE",
    });

    const adminRole = await Role.create({
      companyId: anotherCompanyId,
      name: "Other Company Administrator",
      code: "OTHER_COMPANY_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [adminPermission._id],
      status: "ACTIVE",
    });

    await CompanyAccess.create({
      userId: fixture.targetUserId,
      companyId: anotherCompanyId,
      roleId: adminRole._id,
      status: "ACTIVE",
    });

    await expect(
      ensureEmployeeAccountActionAllowed({
        targetUserId: fixture.targetUserId,
        context: fixture.context,
        action: "RESET_PASSWORD",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects password reset for an administrator in another company", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];

    const anotherCompanyId = new mongoose.Types.ObjectId();

    const adminPermission = await Permission.create({
      code: "admin.update",
      module: "admin",
      action: "update",
      name: "Admin Update",
      status: "ACTIVE",
    });

    const adminRole = await Role.create({
      companyId: anotherCompanyId,
      name: "Other Company Administrator",
      code: "OTHER_COMPANY_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [adminPermission._id],
      status: "ACTIVE",
    });

    await CompanyAccess.create({
      userId: fixture.targetUserId,
      companyId: anotherCompanyId,
      roleId: adminRole._id,
      status: "ACTIVE",
    });

    const attemptedPassword = "BlockedReset@12345";

    await expect(
      resetPassword(fixture.targetUserId, attemptedPassword, fixture.context),
    ).rejects.toMatchObject({
      statusCode: 403,
    });

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    expect(await savedUser.comparePassword(attemptedPassword)).toBe(false);

    expect(savedUser.updatedBy).toBeNull();
  });

  it("rejects password reset outside the actor's department", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];
    fixture.context.roleScopeType = "DEPARTMENT";

    const actorDepartmentId = new mongoose.Types.ObjectId();
    const employeeDepartmentId = new mongoose.Types.ObjectId();

    fixture.context.departmentId = actorDepartmentId;

    // Employee belongs to a different department.
    await CompanyAccess.updateOne(
      {
        userId: fixture.targetUserId,
        companyId: fixture.context.companyId,
      },
      {
        $set: {
          departmentId: employeeDepartmentId,
        },
      },
    );

    const attemptedPassword = "OtherDepartment@12345";

    await expect(
      resetPassword(fixture.targetUserId, attemptedPassword, fixture.context),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    expect(await savedUser.comparePassword(attemptedPassword)).toBe(false);

    expect(savedUser.updatedBy).toBeNull();
  });

  it("rejects password reset outside the actor's managed teams", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];
    fixture.context.roleScopeType = "TEAM";

    // Simulate the authenticated Team Lead's company access.
    fixture.context.companyAccessId = new mongoose.Types.ObjectId();

    // The employee belongs to another team.
    const otherTeamId = new mongoose.Types.ObjectId();

    await CompanyAccess.updateOne(
      {
        userId: fixture.targetUserId,
        companyId: fixture.context.companyId,
      },
      {
        $set: {
          teamId: otherTeamId,
        },
      },
    );

    const attemptedPassword = "OtherTeam@12345";

    await expect(
      resetPassword(fixture.targetUserId, attemptedPassword, fixture.context),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    expect(await savedUser.comparePassword(attemptedPassword)).toBe(false);

    expect(savedUser.updatedBy).toBeNull();
  });

  it("prevents a Team Lead from resetting another team's employee password", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];
    fixture.context.roleScopeType = "TEAM";

    const departmentId = new mongoose.Types.ObjectId();

    // CompanyAccess ID of the authenticated Team Lead.
    const teamLeadAccessId = new mongoose.Types.ObjectId();

    fixture.context.companyAccessId = teamLeadAccessId;

    // Team A is managed by the authenticated Team Lead.
    const managedTeam = await Team.create({
      companyId: fixture.context.companyId,
      departmentId,
      name: "Team Alpha",
      code: "TEAM_ALPHA",
      teamLeadIds: [teamLeadAccessId],
      status: "ACTIVE",
    });

    // Team B is managed by someone else.
    const otherTeam = await Team.create({
      companyId: fixture.context.companyId,
      departmentId,
      name: "Team Beta",
      code: "TEAM_BETA",
      teamLeadIds: [new mongoose.Types.ObjectId()],
      status: "ACTIVE",
    });

    // The target employee belongs to Team B.
    await CompanyAccess.updateOne(
      {
        userId: fixture.targetUserId,
        companyId: fixture.context.companyId,
      },
      {
        $set: {
          departmentId,
          teamId: otherTeam._id,
        },
      },
    );

    const attemptedPassword = "TeamBetaReset@12345";

    await expect(
      resetPassword(fixture.targetUserId, attemptedPassword, fixture.context),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    // Verify the employee's original password remains valid.
    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    expect(await savedUser.comparePassword(attemptedPassword)).toBe(false);

    expect(savedUser.updatedBy).toBeNull();

    // Confirm the Team Lead genuinely manages Team A, not Team B.
    expect(
      managedTeam.teamLeadIds.some(
        (id) => String(id) === String(teamLeadAccessId),
      ),
    ).toBe(true);

    expect(
      otherTeam.teamLeadIds.some(
        (id) => String(id) === String(teamLeadAccessId),
      ),
    ).toBe(false);
  });

  it("allows a Team Lead to reset an employee password within a managed team", async () => {
    const fixture = await createFixture();

    fixture.context.permissionCodes = [ACCOUNT_RESET];
    fixture.context.roleScopeType = "TEAM";

    const departmentId = new mongoose.Types.ObjectId();
    const teamLeadAccessId = new mongoose.Types.ObjectId();

    fixture.context.companyAccessId = teamLeadAccessId;

    const managedTeam = await Team.create({
      companyId: fixture.context.companyId,
      departmentId,
      name: "Team Alpha",
      code: "TEAM_ALPHA",
      teamLeadIds: [teamLeadAccessId],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      {
        userId: fixture.targetUserId,
        companyId: fixture.context.companyId,
      },
      {
        $set: {
          departmentId,
          teamId: managedTeam._id,
        },
      },
    );

    const newPassword = "ManagedTeam@12345";

    const result = await resetPassword(
      fixture.targetUserId,
      newPassword,
      fixture.context,
    );

    expect(result).toBe(true);

    const savedUser = await User.findById(fixture.targetUserId).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    expect(await savedUser.comparePassword(newPassword)).toBe(true);

    expect(await savedUser.comparePassword("Employee@12345")).toBe(false);

    expect(String(savedUser.updatedBy)).toBe(String(fixture.actorId));
  });
});
