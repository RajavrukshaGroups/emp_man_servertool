import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import crypto from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: emailMocks.sendEmail,
}));

import app from "../../src/app.js";

import Company from "../../src/modules/companies/company.model.js";
import User from "../../src/modules/users/user.model.js";
import Role from "../../src/modules/roles/role.model.js";
import Permission from "../../src/modules/permissions/permission.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import CompanyEmailSettings from "../../src/modules/company-email-settings/companyEmailSettings.model.js";
import UserInvitationToken from "../../src/modules/auth/userInvitationToken.model.js";

import { generateAccessToken } from "../../src/modules/auth/token.service.js";

describe("Employee login invitation HTTP authorization", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());

    await UserInvitationToken.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();

    if (replicaSet) {
      await replicaSet.stop();
    }
  });

  beforeEach(() => {
    emailMocks.sendEmail.mockReset();
    emailMocks.sendEmail.mockResolvedValue({
      messageId: "mock-invitation-email",
    });
  });

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);

    await Promise.all(
      collections.map((collection) => collection.deleteMany({})),
    );

    vi.clearAllMocks();
  });

  const createFixture = async ({
    withInvitationPermission = true,
    actorSetupPending = false,
  } = {}) => {
    const company = await Company.create({
      name: "Invitation HTTP Company",
      code: "INVHTTP",
      slug: "invitation-http-company",
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    });

    const permission = await Permission.create({
      code: withInvitationPermission
        ? "admin.invitation_send"
        : "employee.read",
      module: withInvitationPermission ? "admin" : "employee",
      action: withInvitationPermission ? "invitation_send" : "read",
      name: withInvitationPermission
        ? "Send Employee Invitation"
        : "Read Employees",
      status: "ACTIVE",
    });

    const role = await Role.create({
      companyId: company._id,
      name: "Company Administrator",
      code: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      permissionIds: [permission._id],
      status: "ACTIVE",
    });

    const actor = await User.create({
      firstName: "Company",
      lastName: "Administrator",
      email: "invitation.admin@example.com",
      password: "AdminPassword@123",
      passwordSetupStatus: actorSetupPending
        ? "INVITATION_PENDING"
        : "COMPLETED",
      status: "ACTIVE",
    });

    await User.updateOne(
      { _id: actor._id },
      {
        $set: {
          passwordChangedAt: new Date("2025-01-01T00:00:00.000Z"),
        },
      },
    );

    const actorAccess = await CompanyAccess.create({
      userId: actor._id,
      companyId: company._id,
      roleId: role._id,
      status: "ACTIVE",
    });

    const employee = await User.create({
      firstName: "Invited",
      lastName: "Employee",
      email: "invited.employee@example.com",
      password: crypto.randomBytes(32).toString("hex"),
      passwordSetupStatus: "INVITATION_PENDING",
      emailVerified: false,
      status: "ACTIVE",
    });

    const employeeAccess = await CompanyAccess.create({
      userId: employee._id,
      companyId: company._id,
      roleId: role._id,
      status: "ONBOARDING",
    });

    await Employee.create({
      userId: employee._id,
      companyId: company._id,
      companyAccessId: employeeAccess._id,
      status: "ACTIVE",
    });

    await CompanyEmailSettings.create({
      companyId: company._id,
      provider: "GOOGLE_WORKSPACE",
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: "hr@example.com",
      smtpPasswordEncrypted: "dummy-encrypted-test-value",
      fromEmail: "hr@example.com",
      fromName: "HR Department",
      isEnabled: true,
      isVerified: true,
    });

    const accessToken = generateAccessToken({
      userId: actor._id,
      accessType: "COMPANY",
      companyAccessId: actorAccess._id,
      companyId: company._id,
      roleId: role._id,
    });

    return {
      company,
      actor,
      employee,
      accessToken,
    };
  };

  it("rejects requests without authentication", async () => {
    const userId = new mongoose.Types.ObjectId();

    const response = await request(app).post(
      `/api/v1/users/${userId}/send-invitation`,
    );

    expect(response.status).toBe(401);
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects users without invitation permission", async () => {
    const fixture = await createFixture({
      withInvitationPermission: false,
    });

    const response = await request(app)
      .post(`/api/v1/users/${fixture.employee._id}/send-invitation`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(403);
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("allows an authorized company administrator to send an invitation", async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post(`/api/v1/users/${fixture.employee._id}/send-invitation`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1);

    const invitation = await UserInvitationToken.findOne({
      userId: fixture.employee._id,
    });

    expect(invitation).not.toBeNull();
    expect(response.body.data).not.toHaveProperty("token");
    expect(response.body.data).not.toHaveProperty("invitationUrl");
  });

  it("rejects cross-company invitation attempts", async () => {
    const fixture = await createFixture();

    const otherCompanyEmployee = await User.create({
      firstName: "Other",
      lastName: "Company Employee",
      email: "other.company.employee@example.com",
      password: crypto.randomBytes(32).toString("hex"),
      passwordSetupStatus: "INVITATION_PENDING",
      status: "ACTIVE",
    });

    const otherCompanyId = new mongoose.Types.ObjectId();

    const otherAccess = await CompanyAccess.create({
      userId: otherCompanyEmployee._id,
      companyId: otherCompanyId,
      roleId: new mongoose.Types.ObjectId(),
      status: "ONBOARDING",
    });

    await Employee.create({
      userId: otherCompanyEmployee._id,
      companyId: otherCompanyId,
      companyAccessId: otherAccess._id,
      status: "ACTIVE",
    });

    const response = await request(app)
      .post(`/api/v1/users/${otherCompanyEmployee._id}/send-invitation`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect([403, 404]).toContain(response.status);
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("blocks accounts whose invitation setup is pending", async () => {
    const fixture = await createFixture({
      actorSetupPending: true,
    });

    const response = await request(app)
      .post(`/api/v1/users/${fixture.employee._id}/send-invitation`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(403);
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects sending when company email settings are unavailable", async () => {
    const fixture = await createFixture();

    await CompanyEmailSettings.deleteOne({
      companyId: fixture.company._id,
    });

    const response = await request(app)
      .post(`/api/v1/users/${fixture.employee._id}/send-invitation`)
      .set("Authorization", `Bearer ${fixture.accessToken}`);

    expect(response.status).toBe(503);
    expect(emailMocks.sendEmail).not.toHaveBeenCalled();

    expect(
      await UserInvitationToken.countDocuments({
        userId: fixture.employee._id,
      }),
    ).toBe(0);
  });
});
