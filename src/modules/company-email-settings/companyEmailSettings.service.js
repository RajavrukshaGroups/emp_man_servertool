import nodemailer from "nodemailer";

import { decryptEmailCredential } from "../../utils/emailEncryption.js";

import CompanyEmailSettings from "./companyEmailSettings.model.js";

import { encryptEmailCredential } from "../../utils/emailEncryption.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * Approved SMTP provider configurations.
 */
const SMTP_PROVIDERS = {
  GOOGLE_WORKSPACE: {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
  },
  MICROSOFT_365: {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
  },
};

/**
 * Return only safe fields to the frontend.
 * Never expose encrypted or plaintext SMTP credentials.
 */
const toPublicEmailSettings = (settings) => ({
  _id: settings._id,
  companyId: settings.companyId,
  provider: settings.provider,
  smtpHost: settings.smtpHost,
  smtpPort: settings.smtpPort,
  smtpSecure: settings.smtpSecure,
  smtpUser: settings.smtpUser,
  fromEmail: settings.fromEmail,
  fromName: settings.fromName,
  isEnabled: settings.isEnabled,
  isVerified: settings.isVerified,
  lastVerifiedAt: settings.lastVerifiedAt,
  createdAt: settings.createdAt,
  updatedAt: settings.updatedAt,
});

/**
 * Create or replace a company's email configuration.
 *
 * Any credential change requires SMTP verification again.
 */
export const saveCompanyEmailSettings = async ({
  companyId,
  userId,
  provider,
  smtpUser,
  smtpPassword,
  fromEmail,
  fromName,
}) => {
  const providerConfig = SMTP_PROVIDERS[provider];

  if (!providerConfig) {
    throw new ApiError(400, "Unsupported SMTP provider.");
  }

  const encryptedPassword = encryptEmailCredential(smtpPassword);

  const settings = await CompanyEmailSettings.findOneAndUpdate(
    { companyId },
    {
      $set: {
        provider,
        smtpHost: providerConfig.host,
        smtpPort: providerConfig.port,
        smtpSecure: providerConfig.secure,
        smtpUser: smtpUser.trim().toLowerCase(),
        smtpPasswordEncrypted: encryptedPassword,
        fromEmail: fromEmail.trim().toLowerCase(),
        fromName: fromName.trim(),
        isEnabled: false,
        isVerified: false,
        lastVerifiedAt: null,
        updatedBy: userId,
      },
      $setOnInsert: {
        companyId,
        createdBy: userId,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    },
  );

  return toPublicEmailSettings(settings);
};

/**
 * Get a company's email configuration.
 *
 * Never expose SMTP credentials in the response.
 */
export const getCompanyEmailSettings = async ({ companyId }) => {
  const settings = await CompanyEmailSettings.findOne({
    companyId,
  });

  if (!settings) {
    return null;
  }

  return toPublicEmailSettings(settings);
};

/**
 * Verify the company's SMTP credentials.
 *
 * Only mark the configuration as verified after
 * Nodemailer successfully authenticates with SMTP.
 */
export const verifyCompanyEmailSettings = async ({ companyId, userId }) => {
  const settings = await CompanyEmailSettings.findOne({
    companyId,
  }).select("+smtpPasswordEncrypted");

  if (!settings) {
    throw new ApiError(404, "Company email settings not found.");
  }

  const providerConfig = SMTP_PROVIDERS[settings.provider];

  if (!providerConfig) {
    throw new ApiError(400, "Unsupported SMTP provider.");
  }

  const smtpPassword = decryptEmailCredential(settings.smtpPasswordEncrypted);

  const transporter = nodemailer.createTransport({
    host: providerConfig.host,
    port: providerConfig.port,
    secure: providerConfig.secure,
    requireTLS: true,
    auth: {
      user: settings.smtpUser,
      pass: smtpPassword,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transporter.verify();
  } catch {
    throw new ApiError(
      400,
      "SMTP verification failed. Check the provider and credentials.",
    );
  } finally {
    transporter.close();
  }

  /**
   * Update only if the credentials haven't changed
   * while verification was running.
   */
  const updatedSettings = await CompanyEmailSettings.findOneAndUpdate(
    {
      _id: settings._id,
      smtpPasswordEncrypted: settings.smtpPasswordEncrypted,
      provider: settings.provider,
      smtpUser: settings.smtpUser,
      fromEmail: settings.fromEmail,
    },
    {
      $set: {
        isVerified: true,
        lastVerifiedAt: new Date(),
        updatedBy: userId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updatedSettings) {
    throw new ApiError(
      409,
      "Email configuration changed during verification. Please retry.",
    );
  }

  return toPublicEmailSettings(updatedSettings);
};

/**
 * Enable or disable company email delivery.
 *
 * A company cannot enable email sending until
 * its SMTP configuration has been verified.
 */
export const updateCompanyEmailStatus = async ({
  companyId,
  userId,
  isEnabled,
}) => {
  const settings = await CompanyEmailSettings.findOneAndUpdate(
    {
      companyId,
      ...(isEnabled ? { isVerified: true } : {}),
    },
    {
      $set: {
        isEnabled,
        updatedBy: userId,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!settings) {
    if (isEnabled) {
      throw new ApiError(
        400,
        "Verify the company SMTP configuration before enabling email delivery.",
      );
    }

    throw new ApiError(404, "Company email settings not found.");
  }

  return toPublicEmailSettings(settings);
};
