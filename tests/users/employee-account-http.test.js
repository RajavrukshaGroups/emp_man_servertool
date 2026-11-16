import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";

import app from "../../src/app.js";

import { MongoMemoryReplSet } from "mongodb-memory-server";

import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Employee account HTTP authorization", () => {
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

  const createFixture = async ({
    permissionCodes = ["user.employee_account_reset_password"],
  } = {}) => {
    const company = await Company.create({
      name: "Employee Account HTTP Company",
      code: "EMPACC",
      slug: "employee-account-http-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permissions = await Permission.insertMany(
      permissionCodes.map((code) => ({
        code,
        module: code.split(".")[0],
        action: code.split(".").slice(1).join("_"),
        name: code,
        status: "ACTIVE",
      })),
    );

    const managerRole = await Role.create({
      companyId: company._id,
      name: "HR Manager",
      code: "HR_MANAGER",
      scopeType: "COMPANY",
      permissionIds: permissions.map((permission) => permission._id),
      status: "ACTIVE",
    });

    const employeeRole = await Role.create({
      companyId: company._id,
      name: "Employee",
      code: "EMPLOYEE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const manager = await User.create({
      firstName: "Test",
      lastName: "HR Manager",
      email: "account.http.manager@example.com",
      password: "Manager@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const employee = await User.create({
      firstName: "Test",
      lastName: "Employee",
      email: "account.http.employee@example.com",
      password: "Employee@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const managerAccess = await CompanyAccess.create({
      userId: manager._id,
      companyId: company._id,
      roleId: managerRole._id,
      status: "ACTIVE",
    });

    const employeeAccess = await CompanyAccess.create({
      userId: employee._id,
      companyId: company._id,
      roleId: employeeRole._id,
      status: "ACTIVE",
    });

    await Employee.create({
      userId: employee._id,
      companyId: company._id,
      companyAccessId: employeeAccess._id,
      status: "ACTIVE",
    });

    // Give the test account an earlier password-change timestamp
    // so the newly generated JWT is valid.
    // This change affects only the in-memory test database.
    await User.updateOne(
      { _id: manager._id },
      {
        $set: {
          passwordChangedAt: new Date(Date.now() - 60_000),
        },
      },
    );

    const accessToken = generateAccessToken({
      userId: manager._id,
      accessType: "COMPANY",
      companyAccessId: managerAccess._id,
      companyId: company._id,
      roleId: managerRole._id,
    });

    return {
      company,
      manager,
      employee,
      managerRole,
      managerAccess,
      employeeAccess,
      accessToken,
    };
  };

  it("rejects unauthenticated employee password reset requests", async () => {
    const targetUserId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(`/api/v1/users/${targetUserId}/reset-password`)
      .send({
        newPassword: "UnauthorizedReset@12345",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects unauthenticated employee profile updates", async () => {
    const targetUserId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(`/api/v1/users/${targetUserId}`)
      .send({
        firstName: "Unauthorized",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("rejects unauthenticated employee status changes", async () => {
    const targetUserId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .patch(`/api/v1/users/${targetUserId}/status`)
      .send({
        status: "SUSPENDED",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("allows HR Manager to reset an eligible employee password using dedicated permission", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_reset_password"],
    });

    const newPassword = "HRReset@12345";

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}/reset-password`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        newPassword,
        confirmPassword: newPassword,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const savedEmployee = await User.findById(fixture.employee._id).select(
      "+password",
    );

    expect(savedEmployee).not.toBeNull();

    // New password should work.
    expect(await savedEmployee.comparePassword(newPassword)).toBe(true);

    // Previous password should no longer work.
    expect(await savedEmployee.comparePassword("Employee@12345")).toBe(false);

    // Verify the HR Manager is recorded as the actor.
    expect(String(savedEmployee.updatedBy)).toBe(String(fixture.manager._id));

    // Confirm HR Manager was not granted broad admin permissions.
    const managerPermissions = await Role.findById(
      fixture.managerRole._id,
    ).populate("permissionIds");

    const permissionCodes = managerPermissions.permissionIds.map(
      (permission) => permission.code,
    );

    expect(permissionCodes).toContain("user.employee_account_reset_password");

    expect(permissionCodes).not.toContain("admin.update");
  });

  it("rejects employee password reset when the authenticated user lacks permission", async () => {
    const fixture = await createFixture({
      permissionCodes: [],
    });

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}/reset-password`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        newPassword: "BlockedReset@12345",
        confirmPassword: "BlockedReset@12345",
      });
    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    const savedEmployee = await User.findById(fixture.employee._id).select(
      "+password",
    );

    expect(savedEmployee).not.toBeNull();

    // The rejected request must not change the employee password.
    expect(await savedEmployee.comparePassword("Employee@12345")).toBe(true);

    expect(await savedEmployee.comparePassword("BlockedReset@12345")).toBe(
      false,
    );
  });

  it("allows HR Manager to update an eligible employee using dedicated permission", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_update"],
    });

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        firstName: "Updated",
        lastName: "Employee",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedEmployee = await User.findById(fixture.employee._id);

    expect(updatedEmployee.firstName).toBe("Updated");
    expect(updatedEmployee.lastName).toBe("Employee");

    // Verify the HR Manager does not need broad admin.update.
    const managerRole = await Role.findById(fixture.managerRole._id).populate(
      "permissionIds",
    );

    const permissionCodes = managerRole.permissionIds.map(
      (permission) => permission.code,
    );

    expect(permissionCodes).toContain("user.employee_account_update");

    expect(permissionCodes).not.toContain("admin.update");
  });

  it("allows HR Manager to suspend an eligible employee using dedicated permission", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_status_manage"],
    });

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}/status`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        status: "SUSPENDED",
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const updatedEmployee = await User.findById(fixture.employee._id);

    expect(updatedEmployee.status).toBe("SUSPENDED");

    // Verify broad administrator permission is not required.
    const managerRole = await Role.findById(fixture.managerRole._id).populate(
      "permissionIds",
    );

    const permissionCodes = managerRole.permissionIds.map(
      (permission) => permission.code,
    );

    expect(permissionCodes).toContain("user.employee_account_status_manage");

    expect(permissionCodes).not.toContain("admin.deactivate");
  });

  it("rejects employee suspension when the authenticated user lacks permission", async () => {
    const fixture = await createFixture({
      permissionCodes: [],
    });

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}/status`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        status: "SUSPENDED",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // Rejected requests must not modify the employee's status.
    const savedEmployee = await User.findById(fixture.employee._id);

    expect(savedEmployee).not.toBeNull();
    expect(savedEmployee.status).toBe("ACTIVE");
  });

  it("rejects employee profile updates when the authenticated user lacks permission", async () => {
    const fixture = await createFixture({
      permissionCodes: [],
    });

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        firstName: "UnauthorizedUpdate",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // Rejected requests must not change employee details.
    const savedEmployee = await User.findById(fixture.employee._id);

    expect(savedEmployee).not.toBeNull();
    expect(savedEmployee.firstName).toBe("Test");
  });

  it("prevents HR Manager from updating an employee belonging to another company", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_update"],
    });

    // Create a separate company.
    const otherCompany = await Company.create({
      name: "Other Employee Account Company",
      code: "OTHEREMP",
      slug: "other-employee-account-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const otherCompanyRole = await Role.create({
      companyId: otherCompany._id,
      name: "Other Company Employee",
      code: "OTHER_EMPLOYEE",
      scopeType: "COMPANY",
      permissionIds: [],
      status: "ACTIVE",
    });

    const otherEmployee = await User.create({
      firstName: "Other",
      lastName: "Employee",
      email: "other.company.employee@example.com",
      password: "Employee@12345",
      passwordSetupStatus: "COMPLETED",
      status: "ACTIVE",
    });

    const otherEmployeeAccess = await CompanyAccess.create({
      userId: otherEmployee._id,
      companyId: otherCompany._id,
      roleId: otherCompanyRole._id,
      status: "ACTIVE",
    });

    await Employee.create({
      userId: otherEmployee._id,
      companyId: otherCompany._id,
      companyAccessId: otherEmployeeAccess._id,
      status: "ACTIVE",
    });

    // Company A HR Manager attempts to update Company B employee.
    const response = await request(app)
      .patch(`/api/v1/users/${otherEmployee._id}`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        firstName: "UnauthorizedCrossCompany",
      });

    // The API should conceal the existence of out-of-scope users.
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);

    const savedEmployee = await User.findById(otherEmployee._id);

    expect(savedEmployee).not.toBeNull();
    expect(savedEmployee.firstName).toBe("Other");
  });

  it("prevents HR Manager from updating an account with administrative permissions", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_update"],
    });

    // Give the target employee a protected administrative permission.
    const adminPermission = await Permission.create({
      code: "admin.update",
      module: "admin",
      action: "update",
      name: "Update administrators",
      status: "ACTIVE",
    });

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Protected Administrator",
      code: "PROTECTED_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [adminPermission._id],
      status: "ACTIVE",
    });

    // Assign the protected role to the target employee account.
    await CompanyAccess.updateOne(
      { _id: fixture.employeeAccess._id },
      { $set: { roleId: adminRole._id } },
    );

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        firstName: "UnauthorizedAdminUpdate",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // The protected account must remain unchanged.
    const savedUser = await User.findById(fixture.employee._id);

    expect(savedUser).not.toBeNull();
    expect(savedUser.firstName).toBe("Test");
  });

  it("prevents HR Manager from resetting a protected administrator password", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_reset_password"],
    });

    const adminPermission = await Permission.create({
      code: "admin.update",
      module: "admin",
      action: "update",
      name: "Update administrators",
      status: "ACTIVE",
    });

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Protected Administrator",
      code: "PROTECTED_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [adminPermission._id],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.employeeAccess._id },
      { $set: { roleId: adminRole._id } },
    );

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}/reset-password`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        newPassword: "BlockedAdminReset@12345",
        confirmPassword: "BlockedAdminReset@12345",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    const savedUser = await User.findById(fixture.employee._id).select(
      "+password",
    );

    expect(savedUser).not.toBeNull();

    expect(await savedUser.comparePassword("Employee@12345")).toBe(true);

    expect(await savedUser.comparePassword("BlockedAdminReset@12345")).toBe(
      false,
    );
  });

  it("prevents HR Manager from suspending a protected administrator account", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_status_manage"],
    });

    const adminPermission = await Permission.create({
      code: "admin.update",
      module: "admin",
      action: "update",
      name: "Update administrators",
      status: "ACTIVE",
    });

    const adminRole = await Role.create({
      companyId: fixture.company._id,
      name: "Protected Administrator",
      code: "PROTECTED_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [adminPermission._id],
      status: "ACTIVE",
    });

    await CompanyAccess.updateOne(
      { _id: fixture.employeeAccess._id },
      { $set: { roleId: adminRole._id } },
    );

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.employee._id}/status`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        status: "SUSPENDED",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // The protected administrator must remain active.
    const savedUser = await User.findById(fixture.employee._id);

    expect(savedUser).not.toBeNull();
    expect(savedUser.status).toBe("ACTIVE");
  });

  it("prevents HR Manager from suspending their own account", async () => {
    const fixture = await createFixture({
      permissionCodes: ["user.employee_account_status_manage"],
    });

    const response = await request(app)
      .patch(`/api/v1/users/${fixture.manager._id}/status`)
      .set("Authorization", `Bearer ${fixture.accessToken}`)
      .send({
        status: "SUSPENDED",
      });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);

    // The manager must remain active.
    const savedManager = await User.findById(fixture.manager._id);

    expect(savedManager).not.toBeNull();
    expect(savedManager.status).toBe("ACTIVE");
  });
});
