import mongoose from "mongoose";
import crypto from "node:crypto";

import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { sendEmail } from "../../services/email.service.js";

import User from "../users/user.model.js";
import Employee from "../employees/employee.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import CompanyEmailSettings from "../company-email-settings/companyEmailSettings.model.js";
import PlatformAccess from "../platform-access/platformAccess.model.js";

import UserInvitationToken from "./userInvitationToken.model.js";
import RefreshToken from "./refreshToken.model.js";

/**
 * Employee login invitation configuration.
 *
 * Invitation links expire after 24 hours.
 * A new invitation must be issued after expiration.
 */
const INVITATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a secure, single-use invitation token.
 *
 * Only the SHA-256 hash will be stored in MongoDB.
 */
const generateInvitationToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  return {
    rawToken,
    tokenHash,
    expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
  };
};

/**
 * Validate that a user is eligible for a company login invitation.
 */
const getEligibleInvitationUser = async ({ userId, context }) => {
  const { actorId, companyId, roleScopeType } = context;

  if (!actorId || !companyId || roleScopeType !== "COMPANY") {
    throw new ApiError(403, "Company-level administrator context is required.");
  }

  if (String(actorId) === String(userId)) {
    throw new ApiError(403, "You cannot invite your own account.");
  }

  const user = await User.findOne({
    _id: userId,
    status: "ACTIVE",
    passwordSetupStatus: "INVITATION_PENDING",
    isDeleted: false,
  })
    .select("_id firstName displayName email passwordSetupStatus")
    .lean();

  if (!user) {
    throw new ApiError(
      404,
      "An eligible invitation-pending user was not found.",
    );
  }

  const companyAccess = await CompanyAccess.findOne({
    userId: user._id,
    companyId,
    status: { $in: ["ONBOARDING", "ACTIVE"] },
    isDeleted: false,
  })
    .select("_id userId companyId status")
    .lean();

  if (!companyAccess) {
    throw new ApiError(
      404,
      "An eligible employee company membership was not found.",
    );
  }

  const employee = await Employee.findOne({
    userId: user._id,
    companyId,
    companyAccessId: companyAccess._id,
    isDeleted: false,
  })
    .select("_id userId companyId companyAccessId")
    .lean();

  if (!employee) {
    throw new ApiError(404, "A matching employee profile was not found.");
  }

  const otherCompanyMembership = await CompanyAccess.exists({
    userId: user._id,
    companyId: { $ne: companyId },
    isDeleted: false,
    status: { $in: ["ONBOARDING", "ACTIVE"] },
  });

  if (otherCompanyMembership) {
    throw new ApiError(
      409,
      "Invitation setup is unavailable for accounts with another active company membership.",
    );
  }

  /**
   * Prevent invitations to existing platform-level accounts.
   *
   * An employee invitation must never be used to
   * establish a password for a platform administrator.
   */
  const platformAccess = await PlatformAccess.exists({
    userId: user._id,
    isDeleted: false,
  });

  if (platformAccess) {
    throw new ApiError(
      409,
      "Login invitation is unavailable for accounts with platform-level access.",
    );
  }

  return { user, companyAccess, employee };
};

/**
 * Ensure the company can send official login invitations.
 *
 * The existing sendEmail() service will perform its own
 * verification again when delivering the message.
 */
const ensureInvitationEmailAvailable = async (companyId) => {
  const settings = await CompanyEmailSettings.findOne({
    companyId,
    isEnabled: true,
    isVerified: true,
  })
    .select("_id provider fromEmail fromName")
    .lean();

  if (!settings) {
    throw new ApiError(
      503,
      "Company email service is not configured or verified.",
    );
  }

  if (!["GOOGLE_WORKSPACE", "MICROSOFT_365"].includes(settings.provider)) {
    throw new ApiError(
      400,
      "Company email provider is not supported for invitations.",
    );
  }

  if (!settings.fromEmail) {
    throw new ApiError(503, "Company sender email address is not configured.");
  }

  return settings;
};

/**
 * Build the employee password-setup URL.
 *
 * The raw invitation token must only be included in
 * the email sent to the intended employee.
 */
const buildInvitationUrl = (rawToken) => {
  const invitationUrl = new URL("/accept-invitation", env.CLIENT_URL);

  invitationUrl.searchParams.set("token", rawToken);

  return invitationUrl.toString();
};

/**
 * Create a secure invitation token for an eligible user.
 *
 * Prevent multiple active invitations for the same account.
 */
const createInvitationToken = async ({
  userId,
  companyId,
  actorId,
  ipAddress = "",
}) => {
  const now = new Date();

  // Remove expired or previously consumed invitations.
  await UserInvitationToken.deleteMany({
    userId,
    $or: [{ expiresAt: { $lte: now } }, { usedAt: { $ne: null } }],
  });

  const { rawToken, tokenHash, expiresAt } = generateInvitationToken();

  let invitationRecord;

  try {
    invitationRecord = await UserInvitationToken.create({
      userId,
      companyId,
      tokenHash,
      expiresAt,
      createdBy: actorId,
      createdByIp: String(ipAddress).replace("::ffff:", "").slice(0, 100),
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(
        409,
        "An active login invitation already exists for this employee.",
      );
    }

    throw error;
  }

  return {
    invitationRecord,
    rawToken,
    expiresAt,
  };
};

/**
 * Send a secure employee login invitation.
 *
 * Only eligible invitation-pending accounts can receive one.
 */
export const sendUserInvitation = async ({
  userId,
  context,
  ipAddress = "",
}) => {
  const { actorId, companyId } = context;

  // Validate employee ownership and invitation eligibility.
  const { user } = await getEligibleInvitationUser({
    userId,
    context,
  });

  // Verify company email settings before creating the token.
  await ensureInvitationEmailAvailable(companyId);

  const { invitationRecord, rawToken } = await createInvitationToken({
    userId: user._id,
    companyId,
    actorId,
    ipAddress,
  });

  const invitationUrl = buildInvitationUrl(rawToken);
  const employeeName = user.firstName || user.displayName || "Employee";

  const subject = "Set up your Employee Management account";

  const text = [
    `Hello ${employeeName},`,
    "",
    "You have been invited to set up your Employee Management account.",
    "",
    "Use the following secure link to create your password:",
    invitationUrl,
    "",
    "This link expires in 24 hours and can only be used once.",
    "",
    "If you were not expecting this invitation, contact your company administrator.",
  ].join("\n");

  try {
    await sendEmail({
      companyId,
      to: user.email,
      subject,
      text,
    });
  } catch (error) {
    // Do not leave an active token when email delivery fails.
    await UserInvitationToken.deleteOne({
      _id: invitationRecord._id,
      usedAt: null,
    });

    // Never log invitation tokens or URLs.
    console.error("Employee login invitation email delivery failed.", {
      errorName: error?.name,
      errorCode: error?.code,
      smtpCommand: error?.command,
      smtpResponseCode: error?.responseCode,
    });
    throw new ApiError(
      503,
      "Unable to send the login invitation. Please try again later.",
    );
  }

  // Never return the raw token or invitation URL.
  return {
    userId: user._id,
    email: user.email,
    expiresAt: invitationRecord.expiresAt,
    message: "Login invitation sent successfully.",
  };
};

/**
 * Accept an employee login invitation.
 *
 * The token is single-use and must not be expired.
 * Password setup and token consumption must be atomic.
 */
export const acceptUserInvitation = async ({
  token,
  newPassword,
  ipAddress = "",
}) => {
  const invalidTokenMessage =
    "Invitation link is invalid, expired, or already used.";

  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new ApiError(400, invalidTokenMessage);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      // Atomically claim the invitation token.
      const invitationRecord = await UserInvitationToken.findOneAndUpdate(
        {
          tokenHash,
          usedAt: null,
          expiresAt: { $gt: now },
        },
        {
          $set: { usedAt: now },
        },
        {
          new: true,
          session,
        },
      );

      if (!invitationRecord) {
        throw new ApiError(400, invalidTokenMessage);
      }

      /**
       * Revalidate the employee inside the transaction.
       * An invitation must not activate a removed or
       * otherwise ineligible account.
       */
      const user = await User.findOne({
        _id: invitationRecord.userId,
        status: "ACTIVE",
        passwordSetupStatus: "INVITATION_PENDING",
        isDeleted: false,
      })
        .select("+password")
        .session(session);

      if (!user) {
        throw new ApiError(400, invalidTokenMessage);
      }

      const companyAccess = await CompanyAccess.findOne({
        userId: user._id,
        companyId: invitationRecord.companyId,
        status: { $in: ["ONBOARDING", "ACTIVE"] },
        isDeleted: false,
      }).session(session);

      if (!companyAccess) {
        throw new ApiError(400, invalidTokenMessage);
      }

      const employee = await Employee.findOne({
        userId: user._id,
        companyId: invitationRecord.companyId,
        companyAccessId: companyAccess._id,
        isDeleted: false,
      }).session(session);

      if (!employee) {
        throw new ApiError(400, invalidTokenMessage);
      }

      /**
       * Prevent invitation-based password setup when
       * the account belongs to another active company.
       */
      const otherCompanyMembership = await CompanyAccess.exists({
        userId: user._id,
        companyId: { $ne: invitationRecord.companyId },
        status: { $in: ["ONBOARDING", "ACTIVE"] },
        isDeleted: false,
      }).session(session);

      if (otherCompanyMembership) {
        throw new ApiError(400, invalidTokenMessage);
      }

      /**
       * Prevent invitation setup from taking over
       * an existing platform-level account.
       */

      const platformAccess = await PlatformAccess.exists({
        userId: user._id,
        isDeleted: false,
      }).session(session);

      if (platformAccess) {
        throw new ApiError(400, invalidTokenMessage);
      }

      /**
       * Complete the employee's password setup.
       *
       * The User model automatically hashes the password
       * through its existing pre-save middleware.
       */
      user.password = newPassword;
      user.passwordSetupStatus = "COMPLETED";
      user.emailVerified = true;
      user.passwordChangedAt = now;
      user.updatedBy = user._id;

      await user.save({ session });

      /**
       * Revoke any existing refresh sessions.
       *
       * This prevents previously issued refresh tokens
       * from remaining usable after password setup.
       */
      await RefreshToken.updateMany(
        {
          userId: user._id,
          isRevoked: false,
        },
        {
          $set: {
            isRevoked: true,
            revokedAt: now,
            revokedByIp: String(ipAddress).replace("::ffff:", "").slice(0, 100),
            revokeReason: "Employee invitation accepted.",
          },
        },
        { session },
      );

      /**
       * Invalidate any other outstanding invitations.
       */
      await UserInvitationToken.updateMany(
        {
          userId: user._id,
          usedAt: null,
        },
        {
          $set: { usedAt: now },
        },
        { session },
      );
    });

    return {
      success: true,
      message:
        "Your account password has been set successfully. You can now log in.",
    };
  } finally {
    await session.endSession();
  }
};
