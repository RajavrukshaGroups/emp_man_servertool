import Permission from "../permissions/permission.model.js";
import Role from "./role.model.js";

const DEFAULT_COMPANY_ROLES = [
  {
    name: "Company Administrator",
    code: "COMPANY_ADMIN",
    scopeType: "COMPANY",
    description:
      "Company administrator with full access to company-level employee management operations.",
    permissionCodes: [
      "dashboard.read",

      "admin.create",
      "admin.read",
      "admin.update",
      "admin.deactivate",

      "employee.create",
      "employee.read",
      "employee.update",
      "employee.deactivate",

      "role.create",
      "role.read",
      "role.update",
      "role.delete",

      "permission.read",

      "department.create",
      "department.read",
      "department.update",
      "department.delete",

      "team.create",
      "team.read",
      "team.update",
      "team.delete",
      "team.assign_member",
      "team.assign_lead",

      "task.create",
      "task.read",
      "task.assign",
      "task.update",
      "task.submit",
      "task.review",
      "task.approve",
      "task.rework",
      "task.cancel",

      "leave.apply",
      "leave.read",
      "leave.recommend",
      "leave.approve",
      "leave.reject",
      "leave.cancel",

      "attendance.check_in",
      "attendance.check_out",
      "attendance.read",
      "attendance.correction_request",
      "attendance.correction_approve",

      "report.read",
      "report.export",

      "announcement.create",
      "announcement.read",
      "announcement.update",
      "announcement.delete",

      "settings.read",
      "settings.update",

      "audit.read",
    ],
  },

  {
    name: "Team Lead",
    code: "TEAM_LEAD",
    scopeType: "TEAM",
    description:
      "Team lead responsible for team operations, task supervision and employee coordination.",
    permissionCodes: [
      "dashboard.read",

      "employee.read",

      "team.read",

      "task.create",
      "task.read",
      "task.assign",
      "task.update",
      "task.review",
      "task.approve",
      "task.rework",

      "leave.apply",
      "leave.read",
      "leave.recommend",

      "attendance.check_in",
      "attendance.check_out",
      "attendance.read",
      "attendance.correction_request",

      "announcement.read",
    ],
  },

  {
    name: "Employee",
    code: "EMPLOYEE",
    scopeType: "COMPANY",
    description:
      "Standard employee role with self-service and assigned-work access.",
    permissionCodes: [
      "dashboard.read",

      "task.read",
      "task.update",
      "task.submit",

      "leave.apply",
      "leave.read",
      "leave.cancel",

      "attendance.check_in",
      "attendance.check_out",
      "attendance.read",
      "attendance.correction_request",

      "announcement.read",
    ],
  },
];

export const provisionDefaultCompanyRoles = async ({
  companyId,
  actorId = null,
  session = null,
}) => {
  const allPermissionCodes = [
    ...new Set(DEFAULT_COMPANY_ROLES.flatMap((role) => role.permissionCodes)),
  ];

  const permissions = await Permission.find({
    code: {
      $in: allPermissionCodes,
    },
    status: "ACTIVE",
  })
    .select("_id code")
    .session(session)
    .lean();

  const permissionMap = new Map(
    permissions.map((permission) => [permission.code, permission._id]),
  );

  for (const roleDefinition of DEFAULT_COMPANY_ROLES) {
    const permissionIds = roleDefinition.permissionCodes
      .map((code) => permissionMap.get(code))
      .filter(Boolean);

    await Role.findOneAndUpdate(
      {
        companyId,
        code: roleDefinition.code,
        isDeleted: false,
      },
      {
        $set: {
          companyId,

          name: roleDefinition.name,

          code: roleDefinition.code,

          description: roleDefinition.description,

          permissionIds,

          scopeType: roleDefinition.scopeType,

          isSystemRole: true,

          isEditable: false,

          status: "ACTIVE",

          updatedBy: actorId,
        },

        $setOnInsert: {
          createdBy: actorId,
        },
      },
      {
        upsert: true,

        new: true,

        runValidators: true,

        session,
      },
    );
  }
};
