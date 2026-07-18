import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  assignTeamLeads as assignTeamLeadsService,
  assignTeamMembers as assignTeamMembersService,
  createTeam as createTeamService,
  deleteTeam as deleteTeamService,
  getTeamById as getTeamByIdService,
  listTeams as listTeamsService,
  removeTeamMembers as removeTeamMembersService,
  updateTeam as updateTeamService,
  updateTeamStatus as updateTeamStatusService,
} from "./team.service.js";

/**
 * Create team.
 */
export const createTeam = asyncHandler(async (req, res) => {
  const team = await createTeamService({
    companyId: req.validated.params.companyId,
    payload: req.validated.body,
    actorUserId: req.user.userId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, team, "Team created successfully."));
});

/**
 * List teams.
 */
export const listTeams = asyncHandler(async (req, res) => {
  const result = await listTeamsService({
    companyId: req.validated.params.companyId,
    query: req.validated.query,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Teams retrieved successfully."));
});

/**
 * Get team by ID.
 */
export const getTeamById = asyncHandler(async (req, res) => {
  const team = await getTeamByIdService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, team, "Team retrieved successfully."));
});

/**
 * Update team.
 */
export const updateTeam = asyncHandler(async (req, res) => {
  const team = await updateTeamService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
    payload: req.validated.body,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, team, "Team updated successfully."));
});

/**
 * Update team status.
 */
export const updateTeamStatus = asyncHandler(async (req, res) => {
  const team = await updateTeamStatusService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
    status: req.validated.body.status,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, team, "Team status updated successfully."));
});

/**
 * Assign or replace team leads.
 */
export const assignTeamLeads = asyncHandler(async (req, res) => {
  const team = await assignTeamLeadsService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
    teamLeadIds: req.validated.body.teamLeadIds,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, team, "Team leads assigned successfully."));
});

/**
 * Assign members to team.
 */
export const assignTeamMembers = asyncHandler(async (req, res) => {
  const result = await assignTeamMembersService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
    memberIds: req.validated.body.memberIds,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Team members assigned successfully."));
});

/**
 * Remove members from team.
 */
export const removeTeamMembers = asyncHandler(async (req, res) => {
  const result = await removeTeamMembersService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
    memberIds: req.validated.body.memberIds,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Team members removed successfully."));
});

/**
 * Soft delete team.
 */
export const deleteTeam = asyncHandler(async (req, res) => {
  await deleteTeamService({
    companyId: req.validated.params.companyId,
    teamId: req.validated.params.teamId,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Team deleted successfully."));
});
