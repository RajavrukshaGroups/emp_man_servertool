import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { requireCompanyEmailScope } from "./companyEmailScope.middleware.js";

import {
  getEmailSettings,
  saveEmailSettings,
  verifyEmailSettings,
  changeEmailSettingsStatus,
} from "./companyEmailSettings.controller.js";

import {
  getCompanyEmailSettingsSchema,
  updateCompanyEmailSettingsSchema,
  verifyCompanyEmailSettingsSchema,
  updateCompanyEmailStatusSchema,
} from "./companyEmailSettings.validation.js";

const router = Router();

/**
 * All company email settings endpoints require authentication.
 */
router.use(authenticate);

/**
 * View company email settings.
 */
router.get(
  "/:companyId/email-settings",
  requireCompanyEmailScope,
  authorize("settings.read"),
  validate(getCompanyEmailSettingsSchema),
  getEmailSettings,
);

/**
 * Create or update SMTP configuration.
 */
router.put(
  "/:companyId/email-settings",
  requireCompanyEmailScope,
  authorize("settings.update"),
  validate(updateCompanyEmailSettingsSchema),
  saveEmailSettings,
);

/**
 * Verify SMTP credentials.
 */
router.post(
  "/:companyId/email-settings/verify",
  requireCompanyEmailScope,
  authorize("settings.update"),
  validate(verifyCompanyEmailSettingsSchema),
  verifyEmailSettings,
);

/**
 * Enable or disable email sending.
 */
router.patch(
  "/:companyId/email-settings/status",
  requireCompanyEmailScope,
  authorize("settings.update"),
  validate(updateCompanyEmailStatusSchema),
  changeEmailSettingsStatus,
);

export default router;
