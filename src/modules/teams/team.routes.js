import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createTeam,
  deleteTeam,
  getTeamById,
  listTeams,
  updateTeam,
  updateTeamStatus,
  assignTeamLeads,
  assignTeamMembers,
  removeTeamMembers,
} from "./team.controller.js";

import {
  createTeamSchema,
  deleteTeamSchema,
  getTeamByIdSchema,
  listTeamsSchema,
  updateTeamSchema,
  updateTeamStatusSchema,
  assignTeamLeadsSchema,
  assignTeamMembersSchema,
  removeTeamMembersSchema,
} from "./team.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every Team API requires authentication.
 */
router.use(authenticate);

router.post(
  "/",
  authorize(PERMISSIONS.TEAM_CREATE),
  validate(createTeamSchema),
  createTeam,
);

router.get(
  "/",
  authorize(PERMISSIONS.TEAM_READ),
  validate(listTeamsSchema),
  listTeams,
);

router.get(
  "/:teamId",
  authorize(PERMISSIONS.TEAM_READ),
  validate(getTeamByIdSchema),
  getTeamById,
);

router.patch(
  "/:teamId",
  authorize(PERMISSIONS.TEAM_UPDATE),
  validate(updateTeamSchema),
  updateTeam,
);

router.patch(
  "/:teamId/status",
  authorize(PERMISSIONS.TEAM_UPDATE),
  validate(updateTeamStatusSchema),
  updateTeamStatus,
);

router.patch(
  "/:teamId/leads",
  authorize(PERMISSIONS.TEAM_ASSIGN_LEAD),
  validate(assignTeamLeadsSchema),
  assignTeamLeads,
);

router.patch(
  "/:teamId/members",
  authorize(PERMISSIONS.TEAM_ASSIGN_MEMBER),
  validate(assignTeamMembersSchema),
  assignTeamMembers,
);

router.patch(
  "/:teamId/members/remove",
  authorize(PERMISSIONS.TEAM_ASSIGN_MEMBER),
  validate(removeTeamMembersSchema),
  removeTeamMembers,
);

router.delete(
  "/:teamId",
  authorize(PERMISSIONS.TEAM_DELETE),
  validate(deleteTeamSchema),
  deleteTeam,
);

export default router;
