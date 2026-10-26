import Department from "../departments/department.model.js";
import Team from "../teams/team.model.js";

import { getManagedTeamIds } from "./attendance.scope.js";

export const resolveAttendanceExportMetadata = async ({
  companyId,
  query = {},
  requesterContext,
}) => {
  const scope = requesterContext?.roleScopeType;
  const isGlobalOrCompany =
    requesterContext?.accessType === "GLOBAL" ||
    scope === "GLOBAL" ||
    scope === "COMPANY";

  let departmentName = isGlobalOrCompany
    ? "All Departments"
    : "Authorized Departments";

  let teamName = isGlobalOrCompany ? "All Teams" : "Authorized Teams";

  // Department-scoped users
  if (scope === "DEPARTMENT" && !isGlobalOrCompany) {
    if (requesterContext.departmentId) {
      const department = await Department.findOne({
        _id: requesterContext.departmentId,
        companyId,
        isDeleted: false,
      })
        .select("name")
        .lean();

      departmentName = department?.name ?? "Authorized Department";
      teamName = "All Teams in Department";
    }
  }

  // Team Leads may manage multiple teams.
  // Their report also includes their own attendance.
  if (scope === "TEAM" && !isGlobalOrCompany) {
    const managedTeamIds = await getManagedTeamIds({
      companyId,
      companyAccessId: requesterContext.companyAccessId,
    });

    const managedTeams = await Team.find({
      _id: { $in: managedTeamIds },
      companyId,
      isDeleted: false,
    })
      .select("name departmentId")
      .populate({
        path: "departmentId",
        select: "name",
      })
      .lean();

    const teamNames = [
      ...new Set(managedTeams.map((team) => team.name).filter(Boolean)),
    ];

    const departmentNames = [
      ...new Set(
        managedTeams.map((team) => team.departmentId?.name).filter(Boolean),
      ),
    ];

    teamName =
      teamNames.length === 1
        ? `${teamNames[0]} + Self`
        : teamNames.length > 1
          ? `Managed Teams (${teamNames.length}) + Self`
          : "Self Only";

    departmentName =
      departmentNames.length === 1
        ? departmentNames[0]
        : departmentNames.length > 1
          ? "Multiple Departments"
          : "Authorized Department";
  }

  // Explicit filters narrow the authorized scope.
  // These names must be resolved within the requested company.
  if (query.departmentId) {
    const department = await Department.findOne({
      _id: query.departmentId,
      companyId,
      isDeleted: false,
    })
      .select("name")
      .lean();

    if (department) {
      departmentName = department.name;
    }
  }

  if (query.teamId) {
    const team = await Team.findOne({
      _id: query.teamId,
      companyId,
      isDeleted: false,
    })
      .select("name departmentId")
      .populate({
        path: "departmentId",
        select: "name",
      })
      .lean();

    if (team) {
      teamName = team.name;

      if (!query.departmentId && team.departmentId?.name) {
        departmentName = team.departmentId.name;
      }
    }
  }

  return {
    departmentName,
    teamName,
  };
};
