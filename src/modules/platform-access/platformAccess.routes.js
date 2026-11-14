import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { requirePlatformContext } from "../../middlewares/requirePlatformContext.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import {
  createPlatformAdmin,
  getPlatformAdminById,
  listPlatformAdmins,
  listPlatformRoles,
  resetPlatformAdminPassword,
  updatePlatformAdmin,
  updatePlatformAdminStatus,
} from "./platformAccess.controller.js";

import {
  createPlatformAdminSchema,
  listPlatformAdminsSchema,
  listPlatformRolesSchema,
  platformAdminIdSchema,
  resetPlatformAdminPasswordSchema,
  updatePlatformAdminSchema,
  updatePlatformAdminStatusSchema,
} from "./platformAccess.validation.js";

const router = Router();

/**
 * Platform Administrator routes
 */
router.use(authenticate);
router.use(requirePlatformContext);

router.get(
  "/",
  authorize("admin.read"),
  validate(listPlatformAdminsSchema),
  listPlatformAdmins,
);

router.post(
  "/",
  authorize("admin.create"),
  validate(createPlatformAdminSchema),
  createPlatformAdmin,
);

router.get(
  "/:platformAccessId",
  authorize("admin.read"),
  validate(platformAdminIdSchema),
  getPlatformAdminById,
);

router.patch(
  "/:platformAccessId",
  authorize("admin.update"),
  validate(updatePlatformAdminSchema),
  updatePlatformAdmin,
);

router.patch(
  "/:platformAccessId/status",
  authorize("admin.deactivate"),
  validate(updatePlatformAdminStatusSchema),
  updatePlatformAdminStatus,
);

router.patch(
  "/:platformAccessId/reset-password",
  authorize("admin.update"),
  validate(resetPlatformAdminPasswordSchema),
  resetPlatformAdminPassword,
);

/**
 * Platform Role routes
 */
export const platformRoleRouter = Router();

platformRoleRouter.use(authenticate);
platformRoleRouter.use(requirePlatformContext);

platformRoleRouter.get(
  "/",
  authorize("role.read"),
  validate(listPlatformRolesSchema),
  listPlatformRoles,
);

export default router;
