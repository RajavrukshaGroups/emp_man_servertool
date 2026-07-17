import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createCompany as createCompanyService,
  getCompanyById as getCompanyByIdService,
  listCompanies as listCompaniesService,
  softDeleteCompany as softDeleteCompanyService,
  updateCompany as updateCompanyService,
  updateCompanyStatus as updateCompanyStatusService,
} from "./company.service.js";

export const createCompany = asyncHandler(async (req, res) => {
  const { body } = req.validated;

  const company = await createCompanyService(body, req.user?._id ?? null);

  return res
    .status(201)
    .json(new ApiResponse(201, company, "Company created successfully."));
});

export const listCompanies = asyncHandler(async (req, res) => {
  const { query } = req.validated;

  const result = await listCompaniesService(query);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Companies retrieved successfully."));
});

export const getCompanyById = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  const company = await getCompanyByIdService(companyId);

  return res
    .status(200)
    .json(new ApiResponse(200, company, "Company retrieved successfully."));
});

export const updateCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const { body } = req.validated;

  const company = await updateCompanyService(
    companyId,
    body,
    req.user?._id ?? null,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, company, "Company updated successfully."));
});

export const updateCompanyStatus = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const { status } = req.validated.body;

  const company = await updateCompanyStatusService(
    companyId,
    status,
    req.user?._id ?? null,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        company,
        `Company ${
          status === "ACTIVE" ? "activated" : "deactivated"
        } successfully.`,
      ),
    );
});

export const deleteCompany = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;

  await softDeleteCompanyService(companyId, req.user?._id ?? null);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Company deleted successfully."));
});
