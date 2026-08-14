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

/**
 * Get Team Lead dashboard summary.
 *
 * Shows only the authenticated Team Lead's
 * assigned team and members.
 */
/**
 * Get Team Lead dashboard summary.
 */
export const getTeamLeadDashboardSummary = async ({
  companyId,
  companyAccessId,
}) => {
  const company = await validateCompany(companyId);

  const teamLeadAccess = await CompanyAccess.findOne({
    _id: companyAccessId,
    companyId,
    isDeleted: false,
    status: "ACTIVE",
  })
    .select("_id departmentId teamId")
    .lean();

  if (!teamLeadAccess) {
    throw new ApiError(404, "Team Lead company access not found.");
  }

  if (!teamLeadAccess.teamId) {
    return {
      company: {
        _id: company._id,
        name: company.name,
        code: company.code,
        status: company.status,
      },

      department: null,
      team: null,

      members: {
        total: 0,
        active: 0,
        inactive: 0,
      },
    };
  }

  const team = await Team.findOne({
    _id: teamLeadAccess.teamId,
    companyId,
    isDeleted: false,
  })
    .select("_id name code status departmentId")
    .populate({
      path: "departmentId",
      select: "_id name code status",
    })
    .lean();

  if (!team) {
    throw new ApiError(404, "Assigned team not found.");
  }

  const [totalMembers, activeMembers, inactiveMembers] = await Promise.all([
    CompanyAccess.countDocuments({
      companyId,
      teamId: team._id,
      isDeleted: false,
    }),

    CompanyAccess.countDocuments({
      companyId,
      teamId: team._id,
      isDeleted: false,
      status: "ACTIVE",
    }),

    CompanyAccess.countDocuments({
      companyId,
      teamId: team._id,
      isDeleted: false,
      status: "INACTIVE",
    }),
  ]);

  return {
    company: {
      _id: company._id,
      name: company.name,
      code: company.code,
      status: company.status,
    },

    department: team.departmentId
      ? {
          _id: team.departmentId._id,
          name: team.departmentId.name,
          code: team.departmentId.code,
          status: team.departmentId.status,
        }
      : null,

    team: {
      _id: team._id,
      name: team.name,
      code: team.code,
      status: team.status,
    },

    members: {
      total: totalMembers,
      active: activeMembers,
      inactive: inactiveMembers,
    },
  };
};
