import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  listGroupedPermissions,
  listPermissions,
} from "./permission.controller.js";

import { listPermissionsSchema } from "./permission.validation.js";

const router = Router();

router.use(authenticate);

router.use(authorize(PERMISSIONS.PERMISSION_READ));

router.get("/", validate(listPermissionsSchema), listPermissions);

router.get("/grouped", listGroupedPermissions);

export default router;
