import { ApiResponse } from "../../utils/ApiResponse.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

import {
  createEmployee as createEmployeeService,
  listEmployees as listEmployeesService,
  getEmployeeById as getEmployeeByIdService,
  updateEmployee as updateEmployeeService,
  updateEmployeeStatus as updateEmployeeStatusService,
  deleteEmployee as deleteEmployeeService,
} from "./employee.service.js";

export const createEmployee = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const payload = req.validated.body;

  const employee = await createEmployeeService({
    companyId,
    payload,
    actorUserId: req.user.userId,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(201, employee, "Employee profile created successfully."),
    );
});

export const listEmployees = asyncHandler(async (req, res) => {
  const { companyId } = req.validated.params;
  const query = req.validated.query;

  const result = await listEmployeesService({
    companyId,
    query,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Employees retrieved successfully."));
});

export const getEmployeeById = asyncHandler(async (req, res) => {
  const { companyId, employeeId } = req.validated.params;

  const employee = await getEmployeeByIdService({
    companyId,
    employeeId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, employee, "Employee retrieved successfully."));
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const { companyId, employeeId } = req.validated.params;

  const payload = req.validated.body;

  const employee = await updateEmployeeService({
    companyId,
    employeeId,
    payload,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, employee, "Employee profile updated successfully."),
    );
});

export const updateEmployeeStatus = asyncHandler(async (req, res) => {
  const { companyId, employeeId } = req.validated.params;

  const { status } = req.validated.body;

  const employee = await updateEmployeeStatusService({
    companyId,
    employeeId,
    status,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, employee, "Employee status updated successfully."),
    );
});

export const deleteEmployee = asyncHandler(async (req, res) => {
  const { companyId, employeeId } = req.validated.params;

  const result = await deleteEmployeeService({
    companyId,
    employeeId,
    actorUserId: req.user.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Employee profile deleted successfully."),
    );
});
