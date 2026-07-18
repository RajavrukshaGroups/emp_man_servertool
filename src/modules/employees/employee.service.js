import mongoose from "mongoose";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import User from "../users/user.model.js";
import Employee from "./employee.model.js";

import { ApiError } from "../../utils/ApiError.js";

const { Types } = mongoose;

const employeePopulateOptions = [
  {
    path: "companyId",
    select: "name legalName code slug logo status",
  },
  {
    path: "companyAccessId",
    select:
      "employeeCode designation employmentType departmentId teamId roleId reportingManagerId joiningDate probationEndDate lastWorkingDate workLocationType workLocationName status",
    populate: [
      {
        path: "departmentId",
        select: "name code status",
      },
      {
        path: "teamId",
        select: "name code status",
      },
      {
        path: "roleId",
        select: "name code scopeType status",
      },
      {
        path: "reportingManagerId",
        select: "employeeCode designation userId departmentId teamId status",
        populate: {
          path: "userId",
          select:
            "firstName middleName lastName displayName email mobile profilePhoto status",
        },
      },
    ],
  },
  {
    path: "userId",
    select:
      "firstName middleName lastName displayName email mobile profilePhoto status",
  },
  {
    path: "createdBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "updatedBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "deletedBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "documents.verifiedBy",
    select: "firstName lastName displayName email",
  },
];

const ensureCompanyExists = async (companyId) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id name code status")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (company.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "Employee operations are not allowed for an inactive company.",
    );
  }

  return company;
};

const findEmployeeOrFail = async ({
  companyId,
  employeeId,
  populate = true,
}) => {
  let query = Employee.findOne({
    _id: employeeId,
    companyId,
    isDeleted: false,
  });

  if (populate) {
    query = query.populate(employeePopulateOptions);
  }

  const employee = await query;

  if (!employee) {
    throw new ApiError(404, "Employee not found.");
  }

  return employee;
};

const convertToPlainObject = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value.toObject === "function") {
    return value.toObject();
  }

  return { ...value };
};

const mergeNestedObject = (currentValue, incomingValue) => {
  if (!incomingValue) {
    return currentValue;
  }

  return {
    ...convertToPlainObject(currentValue),
    ...incomingValue,
  };
};

const mergeContactDetails = (currentValue, incomingValue) => {
  if (!incomingValue) {
    return currentValue;
  }

  const currentContact = convertToPlainObject(currentValue);

  const mergedContact = {
    ...currentContact,
    ...incomingValue,
  };

  if (incomingValue.currentAddress) {
    mergedContact.currentAddress = {
      ...convertToPlainObject(currentContact.currentAddress),
      ...incomingValue.currentAddress,
    };
  }

  if (incomingValue.permanentAddress) {
    mergedContact.permanentAddress = {
      ...convertToPlainObject(currentContact.permanentAddress),
      ...incomingValue.permanentAddress,
    };
  }

  return mergedContact;
};

const applyEmployeePayload = (employee, payload) => {
  if (payload.personalDetails !== undefined) {
    employee.personalDetails = mergeNestedObject(
      employee.personalDetails,
      payload.personalDetails,
    );
  }

  if (payload.contactDetails !== undefined) {
    employee.contactDetails = mergeContactDetails(
      employee.contactDetails,
      payload.contactDetails,
    );
  }

  if (payload.bankDetails !== undefined) {
    employee.bankDetails = mergeNestedObject(
      employee.bankDetails,
      payload.bankDetails,
    );
  }

  if (payload.statutoryDetails !== undefined) {
    employee.statutoryDetails = mergeNestedObject(
      employee.statutoryDetails,
      payload.statutoryDetails,
    );
  }

  if (payload.emergencyContacts !== undefined) {
    employee.emergencyContacts = payload.emergencyContacts;
  }

  if (payload.documents !== undefined) {
    employee.documents = payload.documents;
  }
};

const checkStatutoryNumberDuplicates = async ({
  companyId,
  statutoryDetails,
  excludeEmployeeId = null,
}) => {
  if (!statutoryDetails) {
    return;
  }

  const duplicateConditions = [];

  if (statutoryDetails.panNumber) {
    duplicateConditions.push({
      "statutoryDetails.panNumber": statutoryDetails.panNumber.toUpperCase(),
    });
  }

  if (statutoryDetails.aadhaarNumber) {
    duplicateConditions.push({
      "statutoryDetails.aadhaarNumber": statutoryDetails.aadhaarNumber,
    });
  }

  if (statutoryDetails.uanNumber) {
    duplicateConditions.push({
      "statutoryDetails.uanNumber": statutoryDetails.uanNumber,
    });
  }

  if (statutoryDetails.esiNumber) {
    duplicateConditions.push({
      "statutoryDetails.esiNumber": statutoryDetails.esiNumber,
    });
  }

  if (statutoryDetails.pfNumber) {
    duplicateConditions.push({
      "statutoryDetails.pfNumber": statutoryDetails.pfNumber,
    });
  }

  if (duplicateConditions.length === 0) {
    return;
  }

  const query = {
    companyId,
    isDeleted: false,
    $or: duplicateConditions,
  };

  if (excludeEmployeeId) {
    query._id = {
      $ne: excludeEmployeeId,
    };
  }

  const duplicateEmployee = await Employee.findOne(query)
    .select(
      "_id statutoryDetails.panNumber statutoryDetails.aadhaarNumber statutoryDetails.uanNumber statutoryDetails.esiNumber statutoryDetails.pfNumber",
    )
    .lean();

  if (!duplicateEmployee) {
    return;
  }

  const duplicateFields = [];

  if (
    statutoryDetails.panNumber &&
    duplicateEmployee.statutoryDetails?.panNumber ===
      statutoryDetails.panNumber.toUpperCase()
  ) {
    duplicateFields.push("PAN number");
  }

  if (
    statutoryDetails.aadhaarNumber &&
    duplicateEmployee.statutoryDetails?.aadhaarNumber ===
      statutoryDetails.aadhaarNumber
  ) {
    duplicateFields.push("Aadhaar number");
  }

  if (
    statutoryDetails.uanNumber &&
    duplicateEmployee.statutoryDetails?.uanNumber === statutoryDetails.uanNumber
  ) {
    duplicateFields.push("UAN number");
  }

  if (
    statutoryDetails.esiNumber &&
    duplicateEmployee.statutoryDetails?.esiNumber === statutoryDetails.esiNumber
  ) {
    duplicateFields.push("ESI number");
  }

  if (
    statutoryDetails.pfNumber &&
    duplicateEmployee.statutoryDetails?.pfNumber === statutoryDetails.pfNumber
  ) {
    duplicateFields.push("PF number");
  }

  throw new ApiError(
    409,
    `Another employee already uses the provided ${duplicateFields.join(", ")}.`,
  );
};

const buildCompanyAccessFilter = async ({
  companyId,
  search,
  departmentId,
  teamId,
  roleId,
  employmentType,
}) => {
  const filter = {
    companyId: new Types.ObjectId(companyId),
    isDeleted: false,
  };

  if (departmentId) {
    filter.departmentId = new Types.ObjectId(departmentId);
  }

  if (teamId) {
    filter.teamId = new Types.ObjectId(teamId);
  }

  if (roleId) {
    filter.roleId = new Types.ObjectId(roleId);
  }

  if (employmentType) {
    filter.employmentType = employmentType;
  }

  if (search) {
    const searchRegex = new RegExp(search, "i");

    const matchingUsers = await User.find({
      isDeleted: false,
      $or: [
        {
          firstName: searchRegex,
        },
        {
          middleName: searchRegex,
        },
        {
          lastName: searchRegex,
        },
        {
          displayName: searchRegex,
        },
        {
          email: searchRegex,
        },
        {
          mobile: searchRegex,
        },
      ],
    })
      .select("_id")
      .lean();

    const matchingUserIds = matchingUsers.map((user) => user._id);

    filter.$or = [
      {
        employeeCode: searchRegex,
      },
      {
        designation: searchRegex,
      },
      {
        workLocationName: searchRegex,
      },
    ];

    if (matchingUserIds.length > 0) {
      filter.$or.push({
        userId: {
          $in: matchingUserIds,
        },
      });
    }
  }

  return filter;
};

export const createEmployee = async ({ companyId, payload, actorUserId }) => {
  await ensureCompanyExists(companyId);

  const companyAccess = await CompanyAccess.findOne({
    _id: payload.companyAccessId,
    companyId,
    isDeleted: false,
  })
    .select(
      "_id companyId userId employeeCode designation departmentId teamId roleId status",
    )
    .lean();

  if (!companyAccess) {
    throw new ApiError(
      404,
      "Company access record not found for the selected company.",
    );
  }

  if (companyAccess.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "An employee profile cannot be created for inactive company access.",
    );
  }

  const user = await User.findOne({
    _id: companyAccess.userId,
    isDeleted: false,
  })
    .select("_id status")
    .lean();

  if (!user) {
    throw new ApiError(
      404,
      "The user linked to this company access record was not found.",
    );
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "An employee profile cannot be created for an inactive user.",
    );
  }

  const existingEmployee = await Employee.findOne({
    $or: [
      {
        companyAccessId: companyAccess._id,
      },
      {
        companyId,
        userId: companyAccess.userId,
      },
    ],
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (existingEmployee) {
    throw new ApiError(
      409,
      "An active employee profile already exists for this company access record.",
    );
  }

  await checkStatutoryNumberDuplicates({
    companyId,
    statutoryDetails: payload.statutoryDetails,
  });

  const employee = new Employee({
    companyId,
    companyAccessId: companyAccess._id,
    userId: companyAccess.userId,
    personalDetails: payload.personalDetails,
    contactDetails: payload.contactDetails,
    emergencyContacts: payload.emergencyContacts,
    bankDetails: payload.bankDetails,
    statutoryDetails: payload.statutoryDetails,
    documents: payload.documents,
    status: "ACTIVE",
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });

  await employee.save();

  return Employee.findById(employee._id).populate(employeePopulateOptions);
};

export const listEmployees = async ({ companyId, query }) => {
  await ensureCompanyExists(companyId);

  const {
    page,
    limit,
    search,
    status,
    departmentId,
    teamId,
    roleId,
    employmentType,
    sortBy,
    sortOrder,
  } = query;

  const companyAccessFilter = await buildCompanyAccessFilter({
    companyId,
    search,
    departmentId,
    teamId,
    roleId,
    employmentType,
  });

  const companyAccessRecords = await CompanyAccess.find(companyAccessFilter)
    .select("_id")
    .lean();

  const companyAccessIds = companyAccessRecords.map((record) => record._id);

  const employeeFilter = {
    companyId,
    isDeleted: false,
  };

  if (status) {
    employeeFilter.status = status;
  }

  if (search || departmentId || teamId || roleId || employmentType) {
    employeeFilter.companyAccessId = {
      $in: companyAccessIds,
    };
  }

  const skip = (page - 1) * limit;

  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const allowedSortFields = ["createdAt", "updatedAt", "status"];

  const selectedSortField = allowedSortFields.includes(sortBy)
    ? sortBy
    : "createdAt";

  const [records, totalRecords] = await Promise.all([
    Employee.find(employeeFilter)
      .populate(employeePopulateOptions)
      .sort({
        [selectedSortField]: sortDirection,
        _id: sortDirection,
      })
      .skip(skip)
      .limit(limit),

    Employee.countDocuments(employeeFilter),
  ]);

  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / limit);

  return {
    records,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

export const getEmployeeById = async ({ companyId, employeeId }) => {
  await ensureCompanyExists(companyId);

  return findEmployeeOrFail({
    companyId,
    employeeId,
  });
};

export const updateEmployee = async ({
  companyId,
  employeeId,
  payload,
  actorUserId,
}) => {
  await ensureCompanyExists(companyId);

  const employee = await findEmployeeOrFail({
    companyId,
    employeeId,
    populate: false,
  });

  if (payload.statutoryDetails) {
    await checkStatutoryNumberDuplicates({
      companyId,
      statutoryDetails: payload.statutoryDetails,
      excludeEmployeeId: employee._id,
    });
  }

  applyEmployeePayload(employee, payload);

  employee.updatedBy = actorUserId;

  await employee.save();

  return Employee.findById(employee._id).populate(employeePopulateOptions);
};

export const updateEmployeeStatus = async ({
  companyId,
  employeeId,
  status,
  actorUserId,
}) => {
  await ensureCompanyExists(companyId);

  const employee = await findEmployeeOrFail({
    companyId,
    employeeId,
    populate: false,
  });

  if (employee.status === status) {
    throw new ApiError(400, `Employee status is already ${status}.`);
  }

  employee.status = status;
  employee.updatedBy = actorUserId;

  await employee.save();

  return Employee.findById(employee._id).populate(employeePopulateOptions);
};

export const deleteEmployee = async ({
  companyId,
  employeeId,
  actorUserId,
}) => {
  await ensureCompanyExists(companyId);

  const employee = await findEmployeeOrFail({
    companyId,
    employeeId,
    populate: false,
  });

  employee.isDeleted = true;
  employee.deletedAt = new Date();
  employee.deletedBy = actorUserId;
  employee.updatedBy = actorUserId;
  employee.status = "ARCHIVED";

  await employee.save();

  return {
    employeeId: employee._id,
    companyAccessId: employee.companyAccessId,
    deletedAt: employee.deletedAt,
  };
};
