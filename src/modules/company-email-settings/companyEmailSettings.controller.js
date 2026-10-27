import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

import {
  getCompanyEmailSettings,
  saveCompanyEmailSettings,
  verifyCompanyEmailSettings,
  updateCompanyEmailStatus,
} from "./companyEmailSettings.service.js";

/**
 * GET /companies/:companyId/email-settings
 */
export const getEmailSettings = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const settings = await getCompanyEmailSettings({ companyId });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        settings,
        "Company email settings retrieved successfully.",
      ),
    );
});

/**
 * PUT /companies/:companyId/email-settings
 */
export const saveEmailSettings = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const settings = await saveCompanyEmailSettings({
    companyId,
    userId: req.user.userId,
    ...req.validated.body,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        settings,
        "Company email settings saved. SMTP verification is required.",
      ),
    );
});

/**
 * POST /companies/:companyId/email-settings/verify
 */
export const verifyEmailSettings = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const settings = await verifyCompanyEmailSettings({
    companyId,
    userId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, settings, "SMTP credentials verified successfully."),
    );
});

/**
 * PATCH /companies/:companyId/email-settings/status
 */
export const changeEmailSettingsStatus = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const { isEnabled } = req.validated.body;

  const settings = await updateCompanyEmailStatus({
    companyId,
    userId: req.user.userId,
    isEnabled,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        settings,
        "Company email status updated successfully.",
      ),
    );
});
