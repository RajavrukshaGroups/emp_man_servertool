import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  changePassword as changePasswordService,
  createUser as createUserService,
  getUserById as getUserByIdService,
  listUsers as listUsersService,
  resetPassword as resetPasswordService,
  softDeleteUser as softDeleteUserService,
  updateUser as updateUserService,
  updateUserStatus as updateUserStatusService,
} from "./user.service.js";

const getRequestContext = (req) => ({
  actorId: req.user?.userId ?? null,
  companyId: req.user?.companyId ?? null,
  roleScopeType: req.user?.roleScopeType ?? null,
});

/**
 * Create user.
 */
export const createUser = asyncHandler(async (req, res) => {
  const context = getRequestContext(req);

  // const user = await createUserService(req.validated.body, context.actorId);
  const user = await createUserService(req.validated.body, context);

  return res
    .status(201)
    .json(new ApiResponse(201, user, "User created successfully."));
});

/**
 * List users.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const context = getRequestContext(req);

  console.log("Controller Context");
  console.dir(context, { depth: null });

  const result = await listUsersService(req.validated.query, context);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Users retrieved successfully."));
});

export const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const context = getRequestContext(req);

  const user = await getUserByIdService(userId, context);

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User retrieved successfully."));
});

/**
 * Update user.
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const context = getRequestContext(req);

  const user = await updateUserService(userId, req.validated.body, context);

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User updated successfully."));
});

/**
 * Update user status.
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;
  const { status } = req.validated.body;

  const context = getRequestContext(req);

  const user = await updateUserStatusService(userId, status, context);

  let message = "User status updated successfully.";

  if (status === "ACTIVE") {
    message = "User activated successfully.";
  }

  if (status === "INACTIVE") {
    message = "User deactivated successfully.";
  }

  if (status === "SUSPENDED") {
    message = "User suspended successfully.";
  }

  return res.status(200).json(new ApiResponse(200, user, message));
});

/**
 * Change authenticated user's password.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;
  const { currentPassword, newPassword } = req.validated.body;

  const context = getRequestContext(req);

  if (String(userId) !== String(context.actorId)) {
    throw new ApiError(403, "You can only change your own password.");
  }

  await changePasswordService(
    userId,
    currentPassword,
    newPassword,
    context.actorId,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password changed successfully."));
});

/**
 * Administrative password reset.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;
  const { newPassword } = req.validated.body;

  const context = getRequestContext(req);

  await resetPasswordService(userId, newPassword, context);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password reset successfully."));
});

/**
 * Soft-delete user.
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const context = getRequestContext(req);

  await softDeleteUserService(userId, context);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User deleted successfully."));
});
