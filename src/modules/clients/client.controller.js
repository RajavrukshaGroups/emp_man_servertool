import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createClient as createClientService,
  deleteClient as deleteClientService,
  getClientById as getClientByIdService,
  listClients as listClientsService,
  updateClient as updateClientService,
  updateClientStatus as updateClientStatusService,
} from "./client.service.js";

/**
 * ============================================================
 * CREATE CLIENT
 *
 * POST /companies/:companyId/clients
 * ============================================================
 */

export const createClient = asyncHandler(async (req, res) => {
  const client = await createClientService({
    companyId: req.validated.params.companyId,

    payload: req.validated.body,

    requesterUserId: req.user.userId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, client, "Client created successfully."));
});

/**
 * ============================================================
 * LIST CLIENTS
 *
 * GET /companies/:companyId/clients
 * ============================================================
 */

export const listClients = asyncHandler(async (req, res) => {
  const result = await listClientsService({
    companyId: req.validated.params.companyId,

    query: req.validated.query,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Clients retrieved successfully."));
});

/**
 * ============================================================
 * GET CLIENT BY ID
 *
 * GET /companies/:companyId/clients/:clientId
 * ============================================================
 */

export const getClientById = asyncHandler(async (req, res) => {
  const client = await getClientByIdService({
    companyId: req.validated.params.companyId,

    clientId: req.validated.params.clientId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, client, "Client retrieved successfully."));
});

/**
 * ============================================================
 * UPDATE CLIENT
 *
 * PATCH /companies/:companyId/clients/:clientId
 * ============================================================
 */

export const updateClient = asyncHandler(async (req, res) => {
  const client = await updateClientService({
    companyId: req.validated.params.companyId,

    clientId: req.validated.params.clientId,

    payload: req.validated.body,

    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, client, "Client updated successfully."));
});

/**
 * ============================================================
 * UPDATE CLIENT STATUS
 *
 * PATCH /companies/:companyId/clients/:clientId/status
 * ============================================================
 */

export const updateClientStatus = asyncHandler(async (req, res) => {
  const client = await updateClientStatusService({
    companyId: req.validated.params.companyId,

    clientId: req.validated.params.clientId,

    status: req.validated.body.status,

    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, client, "Client status updated successfully."));
});

/**
 * ============================================================
 * DELETE CLIENT
 *
 * Soft delete only.
 *
 * DELETE /companies/:companyId/clients/:clientId
 * ============================================================
 */

export const deleteClient = asyncHandler(async (req, res) => {
  const result = await deleteClientService({
    companyId: req.validated.params.companyId,

    clientId: req.validated.params.clientId,

    requesterUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Client deleted successfully."));
});
