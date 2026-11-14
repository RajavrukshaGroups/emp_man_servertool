import { ApiError } from "../../utils/ApiError.js";
import { PERMISSIONS } from "../../constants/permissions.constants.js";
import Permission from "../permissions/permission.model.js";
import Team from "../teams/team.model.js";
import Role from "../roles/role.model.js";

const scopeLevels = {
  TEAM: 1,
  DEPARTMENT: 2,
  COMPANY: 3,
};

const sameId = (left, right) =>
  Boolean(left && right && String(left) === String(right));

export const ensureCompanyAccessRoleAssignmentAllowed = async ({
  companyId,
  targetAccess,
  proposedRole,
  actorContext,
  nextDepartmentId = targetAccess?.departmentId,
  nextTeamId = targetAccess?.teamId,
}) => {
  const actorPermissions = actorContext?.permissionCodes;

  if (
    !Array.isArray(actorPermissions) ||
    !actorPermissions.includes(PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN)
  ) {
    throw new ApiError(403, "Role assignment permission is required.");
  }

  if (
    actorContext.accessType !== "COMPANY" ||
    !sameId(actorContext.companyId, companyId) ||
    !sameId(actorContext.companyAccessId, actorContext.companyAccess?._id)
  ) {
    throw new ApiError(403, "Valid company authorization context is required.");
  }

  if (!sameId(targetAccess.companyId, companyId)) {
    throw new ApiError(403, "Target company access is outside your company.");
  }

  if (sameId(actorContext.userId, targetAccess.userId)) {
    throw new ApiError(403, "You cannot change your own role assignment.");
  }

  const actorScope = actorContext.roleScopeType;
  const actorLevel = scopeLevels[actorScope];
  const proposedLevel = scopeLevels[proposedRole?.scopeType];

  const existingRole = await Role.findOne({
    _id: targetAccess.roleId,
    companyId,
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("scopeType")
    .lean();

  const existingLevel = scopeLevels[existingRole?.scopeType];

  if (
    !actorLevel ||
    !proposedLevel ||
    !existingLevel ||
    proposedLevel > actorLevel ||
    existingLevel > actorLevel
  ) {
    throw new ApiError(403, "Role assignment exceeds your authorized scope.");
  }

  if (actorScope === "DEPARTMENT") {
    const departmentId = actorContext.companyAccess?.departmentId;

    if (
      !departmentId ||
      !sameId(targetAccess.departmentId, departmentId) ||
      !sameId(nextDepartmentId, departmentId)
    ) {
      throw new ApiError(
        403,
        "Employee is outside your authorized department.",
      );
    }
  }

  if (actorScope === "TEAM") {
    const managedTeams = await Team.find({
      companyId,
      teamLeadIds: actorContext.companyAccessId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id departmentId")
      .lean();

    const isManagedTeam = (teamId, departmentId) =>
      managedTeams.some(
        (team) =>
          sameId(team._id, teamId) && sameId(team.departmentId, departmentId),
      );

    if (
      !isManagedTeam(targetAccess.teamId, targetAccess.departmentId) ||
      !isManagedTeam(nextTeamId, nextDepartmentId)
    ) {
      throw new ApiError(403, "Employee is outside your managed teams.");
    }
  }

  if (!actorPermissions.includes(PERMISSIONS.ROLE_PERMISSION_DELEGATE)) {
    const permissionIds = proposedRole.permissionIds ?? [];

    const activePermissions = await Permission.find({
      _id: { $in: permissionIds },
      status: "ACTIVE",
    })
      .select("code")
      .lean();

    const allowed = new Set(actorPermissions);

    if (activePermissions.some((permission) => !allowed.has(permission.code))) {
      throw new ApiError(
        403,
        "You cannot assign a role containing permissions you cannot delegate.",
      );
    }
  }
};

export const ensureCompanyAccessCreationAllowed = async ({
  companyId,
  accessData,
  proposedRole,
  actorContext,
}) => {
  const actorPermissions = actorContext?.permissionCodes;

  if (
    !Array.isArray(actorPermissions) ||
    !actorPermissions.includes(PERMISSIONS.EMPLOYEE_CREATE) ||
    !actorPermissions.includes(PERMISSIONS.COMPANY_ACCESS_ROLE_ASSIGN)
  ) {
    throw new ApiError(
      403,
      "Employee creation and role assignment permissions are required.",
    );
  }

  if (
    actorContext?.accessType !== "COMPANY" ||
    !sameId(actorContext.companyId, companyId) ||
    !sameId(actorContext.companyAccessId, actorContext.companyAccess?._id)
  ) {
    throw new ApiError(403, "Valid company authorization context is required.");
  }

  if (sameId(actorContext.userId, accessData.userId)) {
    throw new ApiError(403, "You cannot create your own company access.");
  }

  const actorScope = actorContext.roleScopeType;
  const actorLevel = scopeLevels[actorScope];
  const proposedLevel = scopeLevels[proposedRole?.scopeType];

  if (!actorLevel || !proposedLevel || proposedLevel > actorLevel) {
    throw new ApiError(403, "Role assignment exceeds your authorized scope.");
  }

  if (actorScope === "DEPARTMENT") {
    const departmentId = actorContext.companyAccess?.departmentId;

    if (!departmentId || !sameId(accessData.departmentId, departmentId)) {
      throw new ApiError(
        403,
        "Employee is outside your authorized department.",
      );
    }
  }

  if (actorScope === "TEAM") {
    const managedTeam = await Team.findOne({
      _id: accessData.teamId,
      companyId,
      departmentId: accessData.departmentId,
      teamLeadIds: actorContext.companyAccessId,
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id")
      .lean();

    if (!managedTeam) {
      throw new ApiError(403, "Employee is outside your managed teams.");
    }
  }

  if (!actorPermissions.includes(PERMISSIONS.ROLE_PERMISSION_DELEGATE)) {
    const permissionIds = proposedRole.permissionIds ?? [];

    const activePermissions = await Permission.find({
      _id: { $in: permissionIds },
      status: "ACTIVE",
    })
      .select("code")
      .lean();

    if (
      activePermissions.some(
        (permission) => !actorPermissions.includes(permission.code),
      )
    ) {
      throw new ApiError(
        403,
        "You cannot assign a role containing permissions you cannot delegate.",
      );
    }
  }
};

export const ensureCompanyAccessUpdateAllowed = async ({
  companyId,
  targetAccess,
  actorContext,
}) => {
  if (!actorContext?.permissionCodes?.includes(PERMISSIONS.EMPLOYEE_UPDATE)) {
    throw new ApiError(403, "Employee update permission is required.");
  }

  if (
    actorContext.accessType !== "COMPANY" ||
    !sameId(actorContext.companyId, companyId) ||
    !sameId(actorContext.companyAccessId, actorContext.companyAccess?._id) ||
    !sameId(targetAccess.companyId, companyId)
  ) {
    throw new ApiError(403, "Valid company authorization context is required.");
  }

  if (actorContext.roleScopeType === "COMPANY") {
    return;
  }

  if (actorContext.roleScopeType === "DEPARTMENT") {
    if (
      !actorContext.companyAccess?.departmentId ||
      !sameId(
        targetAccess.departmentId,
        actorContext.companyAccess.departmentId,
      )
    ) {
      throw new ApiError(403, "Employee is outside your department.");
    }
    return;
  }

  if (actorContext.roleScopeType === "TEAM") {
    const managedTeam = await Team.exists({
      _id: targetAccess.teamId,
      companyId,
      departmentId: targetAccess.departmentId,
      teamLeadIds: actorContext.companyAccessId,
      isDeleted: false,
      status: "ACTIVE",
    });

    if (!managedTeam) {
      throw new ApiError(403, "Employee is outside your managed teams.");
    }
    return;
  }

  throw new ApiError(403, "Unsupported employee update scope.");
};

export const ensureCompanyAccessSensitiveActionAllowed = async ({
  companyId,
  targetAccess,
  actorContext,
  requiredPermission,
}) => {
  const actorPermissions = actorContext?.permissionCodes;

  if (
    !Array.isArray(actorPermissions) ||
    !actorPermissions.includes(requiredPermission)
  ) {
    throw new ApiError(
      403,
      "Required employee management permission is missing.",
    );
  }

  if (
    actorContext.accessType !== "COMPANY" ||
    !sameId(actorContext.companyId, companyId) ||
    !sameId(actorContext.companyAccessId, actorContext.companyAccess?._id) ||
    !sameId(targetAccess.companyId, companyId)
  ) {
    throw new ApiError(403, "Valid company authorization context is required.");
  }

  if (sameId(actorContext.userId, targetAccess.userId)) {
    throw new ApiError(
      403,
      "You cannot modify your own company access status.",
    );
  }

  const actorLevel = scopeLevels[actorContext.roleScopeType];

  const targetRole = await Role.findOne({
    _id: targetAccess.roleId,
    companyId,
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("scopeType permissionIds")
    .lean();

  const targetLevel = scopeLevels[targetRole?.scopeType];

  if (!actorLevel || !targetLevel || targetLevel > actorLevel) {
    throw new ApiError(403, "Target role exceeds your authorized scope.");
  }

  if (actorContext.roleScopeType === "DEPARTMENT") {
    if (
      !actorContext.companyAccess?.departmentId ||
      !sameId(
        targetAccess.departmentId,
        actorContext.companyAccess.departmentId,
      )
    ) {
      throw new ApiError(403, "Employee is outside your department.");
    }
  }

  if (actorContext.roleScopeType === "TEAM") {
    const managedTeam = await Team.exists({
      _id: targetAccess.teamId,
      companyId,
      departmentId: targetAccess.departmentId,
      teamLeadIds: actorContext.companyAccessId,
      status: "ACTIVE",
      isDeleted: false,
    });

    if (!managedTeam) {
      throw new ApiError(403, "Employee is outside your managed teams.");
    }
  }

  const targetPermissions = await Permission.find({
    _id: { $in: targetRole.permissionIds ?? [] },
    status: "ACTIVE",
  })
    .select("code")
    .lean();

  if (
    targetPermissions.some(
      (permission) => !actorPermissions.includes(permission.code),
    )
  ) {
    throw new ApiError(
      403,
      "You cannot manage an account with permissions beyond your authority.",
    );
  }
};
