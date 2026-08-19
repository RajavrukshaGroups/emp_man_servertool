import { Router } from "express";

import { authenticate } from "../../middlewares/authenticate.middleware.js";
import { requireCompanyScope } from "../../middlewares/companyScope.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

import { PERMISSIONS } from "../../constants/permissions.constants.js";

import {
  createClient,
  deleteClient,
  getClientById,
  listClients,
  updateClient,
  updateClientStatus,
} from "./client.controller.js";

import {
  createClientSchema,
  deleteClientSchema,
  getClientByIdSchema,
  listClientsSchema,
  updateClientSchema,
  updateClientStatusSchema,
} from "./client.validation.js";

const router = Router({
  mergeParams: true,
});

/**
 * Every client route requires:
 *
 * 1. Authentication
 * 2. Valid company context
 */
router.use(authenticate);
router.use(requireCompanyScope);

/**
 * ============================================================
 * CREATE CLIENT
 *
 * POST /companies/:companyId/clients
 *
 * Company Admin by default.
 * Other roles only if explicitly granted client.create.
 * ============================================================
 */
router.post(
  "/",
  authorize(PERMISSIONS.CLIENT_CREATE),
  validate(createClientSchema),
  createClient,
);

/**
 * ============================================================
 * LIST CLIENTS
 *
 * GET /companies/:companyId/clients
 *
 * Company Admin + Team Lead by default.
 * ============================================================
 */
router.get(
  "/",
  authorize(PERMISSIONS.CLIENT_READ),
  validate(listClientsSchema),
  listClients,
);

/**
 * ============================================================
 * GET CLIENT BY ID
 *
 * GET /companies/:companyId/clients/:clientId
 * ============================================================
 */
router.get(
  "/:clientId",
  authorize(PERMISSIONS.CLIENT_READ),
  validate(getClientByIdSchema),
  getClientById,
);

/**
 * ============================================================
 * UPDATE CLIENT
 *
 * PATCH /companies/:companyId/clients/:clientId
 * ============================================================
 */
router.patch(
  "/:clientId",
  authorize(PERMISSIONS.CLIENT_UPDATE),
  validate(updateClientSchema),
  updateClient,
);

/**
 * ============================================================
 * UPDATE CLIENT STATUS
 *
 * PATCH /companies/:companyId/clients/:clientId/status
 * ============================================================
 */
router.patch(
  "/:clientId/status",
  authorize(PERMISSIONS.CLIENT_UPDATE),
  validate(updateClientStatusSchema),
  updateClientStatus,
);

/**
 * ============================================================
 * DELETE CLIENT
 *
 * Soft delete only.
 *
 * DELETE /companies/:companyId/clients/:clientId
 * ============================================================
 */
router.delete(
  "/:clientId",
  authorize(PERMISSIONS.CLIENT_DELETE),
  validate(deleteClientSchema),
  deleteClient,
);

export default router;
