import { Router } from "express";

import { validate } from "../../middlewares/validate.middleware.js";

import {
  listGroupedPermissions,
  listPermissions,
} from "./permission.controller.js";

import { listPermissionsSchema } from "./permission.validation.js";

const router = Router();

router.get("/", validate(listPermissionsSchema), listPermissions);

router.get("/grouped", listGroupedPermissions);

export default router;
