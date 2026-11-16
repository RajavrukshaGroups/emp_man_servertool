import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import User from "../../src/modules/users/user.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import UserInvitationToken from "../../src/modules/auth/userInvitationToken.model.js";
import PlatformAccess from "../../src/modules/platform-access/platformAccess.model.js";
import RefreshToken from "../../src/modules/auth/refreshToken.model.js";

import { acceptUserInvitation } from "../../src/modules/auth/userInvitation.service.js";

describe("Employee login invitation integration", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet.stop();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  const createFixture = async () => {
    const companyId = new mongoose.Types.ObjectId();
    const roleId = new mongoose.Types.ObjectId();
    const adminId = new mongoose.Types.ObjectId();

    const user = await User.create({
      firstName: "Invitation",
      lastName: "Employee",
      email: "invitation.employee@example.com",
      password: crypto.randomBytes(32).toString("hex"),
      passwordSetupStatus: "INVITATION_PENDING",
      emailVerified: false,
      status: "ACTIVE",
    });

    const companyAccess = await CompanyAccess.create({
      userId: user._id,
      companyId,
      roleId,
      status: "ONBOARDING",
    });

    await Employee.create({
      userId: user._id,
      companyId,
      companyAccessId: companyAccess._id,
      status: "ACTIVE",
    });

    const token = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const invitation = await UserInvitationToken.create({
      userId: user._id,
      companyId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdBy: adminId,
    });

    return {
      user,
      companyId,
      companyAccess,
      invitation,
      token,
    };
  };

  it("accepts a valid invitation and securely sets the employee password", async () => {
    const fixture = await createFixture();

    const newPassword = "SecureEmployeePassword123!";

    const result = await acceptUserInvitation({
      token: fixture.token,
      newPassword,
      ipAddress: "127.0.0.1",
    });

    expect(result.success).toBe(true);

    const updatedUser = await User.findById(fixture.user._id).select(
      "+password",
    );

    expect(updatedUser.passwordSetupStatus).toBe("COMPLETED");
    expect(updatedUser.emailVerified).toBe(true);
    expect(updatedUser.password).not.toBe(newPassword);

    expect(await updatedUser.comparePassword(newPassword)).toBe(true);

    const updatedInvitation = await UserInvitationToken.findById(
      fixture.invitation._id,
    );

    expect(updatedInvitation.usedAt).not.toBeNull();

    await expect(
      acceptUserInvitation({
        token: fixture.token,
        newPassword: "AnotherSecurePassword123!",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects an expired invitation without changing the employee account", async () => {
    const fixture = await createFixture();

    await UserInvitationToken.updateOne(
      { _id: fixture.invitation._id },
      {
        $set: {
          expiresAt: new Date(Date.now() - 60 * 1000),
        },
      },
    );

    await expect(
      acceptUserInvitation({
        token: fixture.token,
        newPassword: "SecureEmployeePassword123!",
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invitation link is invalid, expired, or already used.",
    });

    const user = await User.findById(fixture.user._id);

    expect(user.passwordSetupStatus).toBe("INVITATION_PENDING");
    expect(user.emailVerified).toBe(false);

    const invitation = await UserInvitationToken.findById(
      fixture.invitation._id,
    );

    expect(invitation.usedAt).toBeNull();
  });

  it("rejects invitation acceptance when the user belongs to another active company", async () => {
    const fixture = await createFixture();

    const anotherCompanyId = new mongoose.Types.ObjectId();
    const anotherRoleId = new mongoose.Types.ObjectId();

    await CompanyAccess.create({
      userId: fixture.user._id,
      companyId: anotherCompanyId,
      roleId: anotherRoleId,
      status: "ACTIVE",
    });

    await expect(
      acceptUserInvitation({
        token: fixture.token,
        newPassword: "SecureEmployeePassword123!",
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invitation link is invalid, expired, or already used.",
    });

    const updatedUser = await User.findById(fixture.user._id);

    expect(updatedUser.passwordSetupStatus).toBe("INVITATION_PENDING");
    expect(updatedUser.emailVerified).toBe(false);

    const updatedInvitation = await UserInvitationToken.findById(
      fixture.invitation._id,
    );

    expect(updatedInvitation.usedAt).toBeNull();
  });

  it("rejects invitation acceptance for an existing platform account", async () => {
    const fixture = await createFixture();

    await PlatformAccess.create({
      userId: fixture.user._id,
      roleId: new mongoose.Types.ObjectId(),
      status: "ACTIVE",
    });

    await expect(
      acceptUserInvitation({
        token: fixture.token,
        newPassword: "SecureEmployeePassword123!",
        ipAddress: "127.0.0.1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invitation link is invalid, expired, or already used.",
    });

    const updatedUser = await User.findById(fixture.user._id);

    expect(updatedUser.passwordSetupStatus).toBe("INVITATION_PENDING");
    expect(updatedUser.emailVerified).toBe(false);

    const updatedInvitation = await UserInvitationToken.findById(
      fixture.invitation._id,
    );

    expect(updatedInvitation.usedAt).toBeNull();
  });

  it("revokes existing refresh tokens after accepting an invitation", async () => {
    const fixture = await createFixture();

    const refreshToken = await RefreshToken.create({
      userId: fixture.user._id,
      accessType: "COMPANY",
      companyAccessId: fixture.companyAccess._id,
      tokenHash: crypto.randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isRevoked: false,
      createdByIp: "127.0.0.1",
    });

    await acceptUserInvitation({
      token: fixture.token,
      newPassword: "SecureEmployeePassword123!",
      ipAddress: "127.0.0.1",
    });

    const updatedRefreshToken = await RefreshToken.findById(refreshToken._id);

    expect(updatedRefreshToken.isRevoked).toBe(true);
    expect(updatedRefreshToken.revokedAt).toBeInstanceOf(Date);
    expect(updatedRefreshToken.revokedByIp).toBe("127.0.0.1");
    expect(updatedRefreshToken.revokeReason).toBe(
      "Employee invitation accepted.",
    );

    const activeRefreshTokens = await RefreshToken.countDocuments({
      userId: fixture.user._id,
      isRevoked: false,
    });

    expect(activeRefreshTokens).toBe(0);
  });
});
