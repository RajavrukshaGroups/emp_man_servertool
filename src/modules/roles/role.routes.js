import { Router } from "express";

import { validate } from "../../middlewares/validate.middleware.js";

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

router.post("/", validate(createRoleSchema), createRole);

router.get("/", validate(listRolesSchema), listRoles);

router.get("/:roleId", validate(roleIdParamSchema), getRoleById);

router.patch("/:roleId", validate(updateRoleSchema), updateRole);

router.patch(
  "/:roleId/permissions",
  validate(updateRolePermissionsSchema),
  updateRolePermissions,
);

router.patch("/:roleId/status", validate(roleStatusSchema), updateRoleStatus);

router.delete("/:roleId", validate(roleIdParamSchema), deleteRole);

export default router;
