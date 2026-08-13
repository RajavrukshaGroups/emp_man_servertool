import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Department from "../departments/department.model.js";
import Role from "../roles/role.model.js";
import Team from "../teams/team.model.js";

/**
 * Ensure the company exists.
 */
const validateCompany = async (companyId) => {
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
      "Dashboard is unavailable for an inactive company.",
    );
  }

  return company;
};

/**
 * Get company dashboard summary.
 */
export const getDashboardSummary = async ({ companyId }) => {
  const company = await validateCompany(companyId);

  const [
    totalEmployees,
    activeEmployees,
    onboardingEmployees,
    inactiveEmployees,

    totalDepartments,
    activeDepartments,

    totalTeams,
    activeTeams,

    totalRoles,

    employeesWithoutDepartment,
    employeesWithoutTeam,
  ] = await Promise.all([
    CompanyAccess.countDocuments({
      companyId,
      isDeleted: false,
    }),

    CompanyAccess.countDocuments({
      companyId,
      isDeleted: false,
      status: "ACTIVE",
    }),

    CompanyAccess.countDocuments({
      companyId,
      isDeleted: false,
      status: "ONBOARDING",
    }),

    CompanyAccess.countDocuments({
      companyId,
      isDeleted: false,
      status: "INACTIVE",
    }),

    Department.countDocuments({
      companyId,
      isDeleted: false,
    }),

    Department.countDocuments({
      companyId,
      isDeleted: false,
      status: "ACTIVE",
    }),

    Team.countDocuments({
      companyId,
      isDeleted: false,
    }),

    Team.countDocuments({
      companyId,
      isDeleted: false,
      status: "ACTIVE",
    }),

    Role.countDocuments({
      companyId,
      status: "ACTIVE",
      isDeleted: false,
    }),

    CompanyAccess.countDocuments({
      companyId,
      isDeleted: false,
      status: "ACTIVE",
      departmentId: null,
    }),

    CompanyAccess.countDocuments({
      companyId,
      isDeleted: false,
      status: "ACTIVE",
      teamId: null,
    }),
  ]);

  return {
    company: {
      _id: company._id,
      name: company.name,
      code: company.code,
      status: company.status,
    },

    employees: {
      total: totalEmployees,
      active: activeEmployees,
      onboarding: onboardingEmployees,
      inactive: inactiveEmployees,
    },

    departments: {
      total: totalDepartments,
      active: activeDepartments,
      inactive: totalDepartments - activeDepartments,
    },

    teams: {
      total: totalTeams,
      active: activeTeams,
      inactive: totalTeams - activeTeams,
    },

    roles: {
      total: totalRoles,
    },

    organisation: {
      employeesWithoutDepartment,
      employeesWithoutTeam,
    },
  };
};
