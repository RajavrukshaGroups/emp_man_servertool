import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { requireCompanyScope } from "../../middlewares/companyScope.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createRole,
  deleteRole,
  getRoleById,
  listRoles,
  updateRole,
  updateRolePermissions,
  updateRoleStatus,
} from "./role.controller.js";

import {
  createRoleSchema,
  listRolesSchema,
  roleIdParamSchema,
  roleStatusSchema,
  updateRolePermissionsSchema,
  updateRoleSchema,
} from "./role.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every company role API requires authentication
 * and must belong to the authenticated company.
 */
router.use(authenticate);
router.use(requireCompanyScope);

/**
 * Create custom role.
 */
router.post(
  "/",
  authorize(PERMISSIONS.ROLE_CREATE),
  validate(createRoleSchema),
  createRole,
);

/**
 * List company roles.
 */
router.get(
  "/",
  authorize(PERMISSIONS.ROLE_READ),
  validate(listRolesSchema),
  listRoles,
);

/**
 * Get one company role.
 */
router.get(
  "/:roleId",
  authorize(PERMISSIONS.ROLE_READ),
  validate(roleIdParamSchema),
  getRoleById,
);

/**
 * Update custom role.
 */
router.patch(
  "/:roleId",
  authorize(PERMISSIONS.ROLE_UPDATE),
  validate(updateRoleSchema),
  updateRole,
);

/**
 * Replace permissions assigned to a custom role.
 */
router.patch(
  "/:roleId/permissions",
  authorize(PERMISSIONS.ROLE_UPDATE),
  validate(updateRolePermissionsSchema),
  updateRolePermissions,
);

/**
 * Activate / deactivate custom role.
 */
router.patch(
  "/:roleId/status",
  authorize(PERMISSIONS.ROLE_UPDATE),
  validate(roleStatusSchema),
  updateRoleStatus,
);

/**
 * Soft delete custom role.
 */
router.delete(
  "/:roleId",
  authorize(PERMISSIONS.ROLE_DELETE),
  validate(roleIdParamSchema),
  deleteRole,
);

export default router;
