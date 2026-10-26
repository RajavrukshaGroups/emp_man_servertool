import Department from "../departments/department.model.js";
import Team from "../teams/team.model.js";

export const resolveAttendanceExportMetadata = async ({ companyId, query }) => {
  let departmentName = "All Departments";
  let teamName = "All Teams";

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
