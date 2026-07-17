import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

import { getGroupedPermissions, getPermissions } from "./permission.service.js";

export const listPermissions = asyncHandler(async (req, res) => {
  const query = req.validated?.query ?? req.query;

  const permissions = await getPermissions(query);

  return res
    .status(200)
    .json(
      new ApiResponse(200, permissions, "Permissions retrieved successfully."),
    );
});

export const listGroupedPermissions = asyncHandler(async (req, res) => {
  const permissions = await getGroupedPermissions();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        permissions,
        "Grouped permissions retrieved successfully.",
      ),
    );
});
