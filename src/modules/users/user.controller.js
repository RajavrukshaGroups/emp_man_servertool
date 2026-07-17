import { ApiResponse } from "../../utils/ApiResponse.js";
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

/**
 * Create user.
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await createUserService(
    req.validated.body,
    req.user?._id ?? null,
  );

  return res
    .status(201)
    .json(new ApiResponse(201, user, "User created successfully."));
});

/**
 * List users.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const result = await listUsersService(req.validated.query);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Users retrieved successfully."));
});

/**
 * Get user by ID.
 */
export const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const user = await getUserByIdService(userId);

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User retrieved successfully."));
});

/**
 * Update user.
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  const user = await updateUserService(
    userId,
    req.validated.body,
    req.user?._id ?? null,
  );

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

  const user = await updateUserStatusService(
    userId,
    status,
    req.user?._id ?? null,
  );

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
 * Change user password.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;
  const { currentPassword, newPassword } = req.validated.body;

  await changePasswordService(
    userId,
    currentPassword,
    newPassword,
    req.user?._id ?? null,
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

  await resetPasswordService(userId, newPassword, req.user?._id ?? null);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Password reset successfully."));
});

/**
 * Soft-delete user.
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.validated.params;

  await softDeleteUserService(userId, req.user?._id ?? null);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "User deleted successfully."));
});
