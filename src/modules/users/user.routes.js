import { Router } from "express";

import { validate } from "../../middlewares/validate.middleware.js";

import {
  changePassword,
  createUser,
  deleteUser,
  getUserById,
  listUsers,
  resetPassword,
  updateUser,
  updateUserStatus,
} from "./user.controller.js";

import {
  changePasswordSchema,
  createUserSchema,
  listUsersSchema,
  resetPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from "./user.validation.js";

const router = Router();

router.post("/", validate(createUserSchema), createUser);

router.get("/", validate(listUsersSchema), listUsers);

router.get("/:userId", validate(userIdParamSchema), getUserById);

router.patch("/:userId", validate(updateUserSchema), updateUser);

router.patch(
  "/:userId/status",
  validate(updateUserStatusSchema),
  updateUserStatus,
);

router.patch(
  "/:userId/change-password",
  validate(changePasswordSchema),
  changePassword,
);

router.patch(
  "/:userId/reset-password",
  validate(resetPasswordSchema),
  resetPassword,
);

router.delete("/:userId", validate(userIdParamSchema), deleteUser);

export default router;
