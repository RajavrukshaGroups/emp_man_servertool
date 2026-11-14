import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

vi.mock("../../src/services/email.service.js", () => ({
  sendEmail: vi.fn(),
}));

import { sendEmail } from "../../src/services/email.service.js";

import User from "../../src/modules/users/user.model.js";
import CompanyAccess from "../../src/modules/company-access/companyAccess.model.js";
import Employee from "../../src/modules/employees/employee.model.js";
import CompanyEmailSettings from "../../src/modules/company-email-settings/companyEmailSettings.model.js";
import UserInvitationToken from "../../src/modules/auth/userInvitationToken.model.js";

import { sendUserInvitation } from "../../src/modules/auth/userInvitation.service.js";

describe("Employee login invitation sending integration", () => {
  let replicaSet;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });

    await mongoose.connect(replicaSet.getUri());

    // Ensure the unique invitation index exists before tests execute.
    await UserInvitationToken.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replicaSet.stop();
  });

  afterEach(async () => {
    vi.clearAllMocks();

    // Delete test records while preserving MongoDB indexes.
    const collections = Object.values(mongoose.connection.collections);

    await Promise.all(
      collections.map((collection) => collection.deleteMany({})),
    );
  });

  const createFixture = async () => {
    const companyId = new mongoose.Types.ObjectId();
    const actorId = new mongoose.Types.ObjectId();

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
      roleId: new mongoose.Types.ObjectId(),
      status: "ONBOARDING",
    });

    await Employee.create({
      userId: user._id,
      companyId,
      companyAccessId: companyAccess._id,
      status: "ACTIVE",
    });

    await CompanyEmailSettings.create({
      companyId,
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

    return {
      user,
      companyId,
      actorId,
      context: {
        actorId,
        companyId,
        roleScopeType: "COMPANY",
      },
    };
  };

  it("sends an invitation and stores only the token hash", async () => {
    const fixture = await createFixture();

    vi.mocked(sendEmail).mockResolvedValueOnce({
      messageId: "test-invitation-email",
    });

    const result = await sendUserInvitation({
      userId: fixture.user._id,
      context: fixture.context,
      ipAddress: "127.0.0.1",
    });

    expect(result.message).toBe("Login invitation sent successfully.");

    expect(result.email).toBe(fixture.user.email);

    expect(sendEmail).toHaveBeenCalledTimes(1);

    const emailArgs = vi.mocked(sendEmail).mock.calls[0][0];

    expect(String(emailArgs.companyId)).toBe(String(fixture.companyId));

    expect(emailArgs.to).toBe(fixture.user.email);

    const invitationUrlMatch = emailArgs.text.match(
      /https?:\/\/[^\s]+\/accept-invitation\?token=[a-f0-9]{64}/i,
    );

    expect(invitationUrlMatch).not.toBeNull();

    const invitationUrl = new URL(invitationUrlMatch[0]);
    const rawToken = invitationUrl.searchParams.get("token");

    const invitation = await UserInvitationToken.findOne({
      userId: fixture.user._id,
    }).select("+tokenHash");

    expect(invitation).not.toBeNull();

    const expectedHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    expect(invitation.tokenHash).toBe(expectedHash);
    expect(invitation.tokenHash).not.toBe(rawToken);
    expect(invitation.usedAt).toBeNull();

    // Raw tokens and invitation URLs must never be returned by the API service.
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("invitationUrl");
  });

  it("rejects duplicate invitations without sending another email", async () => {
    const fixture = await createFixture();

    vi.mocked(sendEmail).mockResolvedValueOnce({
      messageId: "first-invitation",
    });

    await sendUserInvitation({
      userId: fixture.user._id,
      context: fixture.context,
    });

    const existingInvitations = await UserInvitationToken.find({
      userId: fixture.user._id,
    }).lean();

    expect(existingInvitations).toHaveLength(1);
    expect(existingInvitations[0].usedAt).toBeNull();

    const indexes = await UserInvitationToken.collection.indexes();

    expect(
      indexes.some(
        (index) =>
          index.name === "unique_unused_invitation_per_user" &&
          index.unique === true,
      ),
    ).toBe(true);

    await expect(
      sendUserInvitation({
        userId: fixture.user._id,
        context: fixture.context,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);

    expect(
      await UserInvitationToken.countDocuments({
        userId: fixture.user._id,
        usedAt: null,
      }),
    ).toBe(1);
  });

  it("removes the invitation token when email delivery fails", async () => {
    const fixture = await createFixture();

    vi.mocked(sendEmail).mockRejectedValueOnce(
      new Error("Simulated SMTP failure"),
    );

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(
        sendUserInvitation({
          userId: fixture.user._id,
          context: fixture.context,
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
      });

      expect(
        await UserInvitationToken.countDocuments({
          userId: fixture.user._id,
        }),
      ).toBe(0);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("rejects invitations for employees belonging to another company", async () => {
    const fixture = await createFixture();

    await expect(
      sendUserInvitation({
        userId: fixture.user._id,
        context: {
          ...fixture.context,
          companyId: new mongoose.Types.ObjectId(),
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
