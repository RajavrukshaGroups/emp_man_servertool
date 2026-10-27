import nodemailer from "nodemailer";

import { ApiError } from "../utils/ApiError.js";

import CompanyEmailSettings from "../modules/company-email-settings/companyEmailSettings.model.js";

import { decryptEmailCredential } from "../utils/emailEncryption.js";

/**
 * Allow only approved SMTP providers.
 * Avoid arbitrary SMTP hosts supplied by company users.
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
 * Send an email using the selected company's official account.
 */
export const sendEmail = async ({ companyId, to, subject, text, html }) => {
  if (!companyId) {
    throw new ApiError(400, "Company ID is required to send an email.");
  }

  const settings = await CompanyEmailSettings.findOne({
    companyId,
    isEnabled: true,
    isVerified: true,
  }).select("+smtpPasswordEncrypted");

  if (!settings) {
    throw new ApiError(
      503,
      "Company email service is not configured or verified.",
    );
  }

  const providerConfig = SMTP_PROVIDERS[settings.provider];

  if (!providerConfig) {
    throw new ApiError(400, "Email provider is not supported.");
  }

  const smtpPassword = decryptEmailCredential(settings.smtpPasswordEncrypted);

  const transporter = nodemailer.createTransport({
    host: providerConfig.host,
    port: providerConfig.port,
    secure: providerConfig.secure,
    auth: {
      user: settings.smtpUser,
      pass: smtpPassword,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    return await transporter.sendMail({
      from: {
        name: settings.fromName,
        address: settings.fromEmail,
      },
      to,
      subject,
      text,
      html,
    });
  } finally {
    transporter.close();
  }
};
