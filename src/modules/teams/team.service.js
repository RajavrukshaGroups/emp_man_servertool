import { ApiError } from "../../utils/ApiError.js";

import Company from "../companies/company.model.js";
import CompanyAccess from "../company-access/companyAccess.model.js";
import Department from "../departments/department.model.js";
import Team from "./team.model.js";

const teamPopulate = [
  {
    path: "departmentId",
    select: "name code description status parentDepartmentId",
  },
  {
    path: "teamLeadIds",
    select:
      "userId employeeCode designation employmentType status departmentId teamId",
    populate: {
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    },
  },
  {
    path: "createdBy",
    select: "firstName lastName displayName email",
  },
  {
    path: "updatedBy",
    select: "firstName lastName displayName email",
  },
];

const normalizeTeamName = (name) => name.replace(/\s+/g, " ").trim();

const normalizeTeamCode = (code) =>
  code
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toUpperCase()
    .trim();

/**
 * Ensure the company exists and is available.
 */
const validateCompany = async (companyId, { requireActive = true } = {}) => {
  const company = await Company.findOne({
    _id: companyId,
    isDeleted: false,
  })
    .select("_id name code status")
    .lean();

  if (!company) {
    throw new ApiError(404, "Company not found.");
  }

  if (requireActive && company.status !== "ACTIVE") {
    throw new ApiError(
      403,
      "Team operations are not allowed for an inactive company.",
    );
  }

  return company;
};

/**
 * Ensure the department exists inside the selected company.
 */
const validateDepartment = async ({
  companyId,
  departmentId,
  requireActive = true,
}) => {
  const department = await Department.findOne({
    _id: departmentId,
    companyId,
    isDeleted: false,
  })
    .select("_id companyId name code status")
    .lean();

  if (!department) {
    throw new ApiError(
      400,
      "Department does not exist in the selected company.",
    );
  }

  if (requireActive && department.status !== "ACTIVE") {
    throw new ApiError(
      400,
      "An inactive department cannot be assigned to a team.",
    );
  }

  return department;
};

/**
 * Ensure a team exists inside the selected company.
 */
const findTeamOrFail = async (
  companyId,
  teamId,
  { populate = false, lean = false } = {},
) => {
  let query = Team.findOne({
    _id: teamId,
    companyId,
    isDeleted: false,
  });

  if (populate) {
    query = query.populate(teamPopulate);
  }

  if (lean) {
    query = query.lean();
  }

  const team = await query;

  if (!team) {
    throw new ApiError(404, "Team not found.");
  }

  return team;
};

/**
 * Check duplicate team name and code.
 *
 * Team name is unique inside a department.
 * Team code is unique inside a company.
 */
const validateTeamUniqueness = async ({
  companyId,
  departmentId,
  name,
  code,
  excludeTeamId = null,
}) => {
  const normalizedName = name ? normalizeTeamName(name) : null;

  const normalizedCode = code ? normalizeTeamCode(code) : null;

  const filters = [];

  if (normalizedName && departmentId) {
    filters.push({
      companyId,
      departmentId,
      name: normalizedName,
      isDeleted: false,
    });
  }

  if (normalizedCode) {
    filters.push({
      companyId,
      code: normalizedCode,
      isDeleted: false,
    });
  }

  if (filters.length === 0) {
    return;
  }

  if (excludeTeamId) {
    filters.forEach((filter) => {
      filter._id = {
        $ne: excludeTeamId,
      };
    });
  }

  const duplicateTeam = await Team.findOne({
    $or: filters,
  })
    .select("_id name code departmentId")
    .lean();

  if (!duplicateTeam) {
    return;
  }

  if (
    normalizedName &&
    duplicateTeam.departmentId.toString() === departmentId.toString() &&
    duplicateTeam.name.toLowerCase() === normalizedName.toLowerCase()
  ) {
    throw new ApiError(
      409,
      "A team with this name already exists in the department.",
    );
  }

  if (normalizedCode && duplicateTeam.code === normalizedCode) {
    throw new ApiError(
      409,
      "A team with this code already exists in the company.",
    );
  }

  throw new ApiError(
    409,
    "A team with the provided name or code already exists.",
  );
};

/**
 * Validate team leads.
 *
 * Every team lead must:
 * - be an active CompanyAccess record
 * - belong to the selected company
 * - belong to the selected department
 */
const validateTeamLeads = async ({
  companyId,
  departmentId,
  teamLeadIds = [],
}) => {
  if (!teamLeadIds.length) {
    return [];
  }

  const uniqueTeamLeadIds = [
    ...new Set(teamLeadIds.map((id) => id.toString())),
  ];

  const teamLeads = await CompanyAccess.find({
    _id: {
      $in: uniqueTeamLeadIds,
    },
    companyId,
    isDeleted: false,
    status: {
      $in: ["ACTIVE", "ONBOARDING"],
    },
  })
    .select(
      "_id userId companyId employeeCode designation status departmentId teamId",
    )
    .lean();

  if (teamLeads.length !== uniqueTeamLeadIds.length) {
    throw new ApiError(
      400,
      "One or more team leads are invalid, inactive, deleted, or do not belong to the selected company.",
    );
  }

  const leadFromAnotherDepartment = teamLeads.find(
    (teamLead) =>
      !teamLead.departmentId ||
      teamLead.departmentId.toString() !== departmentId.toString(),
  );

  if (leadFromAnotherDepartment) {
    throw new ApiError(
      400,
      "Every team lead must belong to the same department as the team.",
    );
  }

  return teamLeads;
};

/**
 * Validate team members.
 *
 * Members must be active CompanyAccess records belonging
 * to the selected company.
 */
const validateTeamMembers = async ({ companyId, memberIds = [] }) => {
  if (!memberIds.length) {
    return [];
  }

  const uniqueMemberIds = [...new Set(memberIds.map((id) => id.toString()))];

  const members = await CompanyAccess.find({
    _id: {
      $in: uniqueMemberIds,
    },
    companyId,
    isDeleted: false,
    status: {
      $in: ["ACTIVE", "ONBOARDING"],
    },
  })
    .select(
      "_id userId companyId employeeCode designation status departmentId teamId",
    )
    .lean();

  if (members.length !== uniqueMemberIds.length) {
    throw new ApiError(
      400,
      "One or more team members are invalid, inactive, deleted, or do not belong to the selected company.",
    );
  }

  return members;
};

/**
 * Create team.
 */
export const createTeam = async ({
  companyId,
  payload,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const department = await validateDepartment({
    companyId,
    departmentId: payload.departmentId,
  });

  const normalizedName = normalizeTeamName(payload.name);
  const normalizedCode = normalizeTeamCode(payload.code);

  await validateTeamUniqueness({
    companyId,
    departmentId: department._id,
    name: normalizedName,
    code: normalizedCode,
  });

  await validateTeamLeads({
    companyId,
    departmentId: department._id,
    teamLeadIds: payload.teamLeadIds ?? [],
  });

  const team = await Team.create({
    companyId,
    departmentId: department._id,
    name: normalizedName,
    code: normalizedCode,
    description: payload.description ?? "",
    teamLeadIds: payload.teamLeadIds ?? [],
    status: payload.status ?? "ACTIVE",
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });

  return Team.findById(team._id).populate(teamPopulate).lean();
};

/**
 * List teams.
 */
export const listTeams = async ({ companyId, query }) => {
  await validateCompany(companyId, {
    requireActive: false,
  });

  const {
    page = 1,
    limit = 10,
    search,
    departmentId,
    status,
    teamLeadId,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,
    isDeleted: false,
  };

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      {
        name: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        code: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
      {
        description: {
          $regex: escapedSearch,
          $options: "i",
        },
      },
    ];
  }

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (status) {
    filter.status = status;
  }

  if (teamLeadId) {
    filter.teamLeadIds = teamLeadId;
  }

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
    _id: 1,
  };

  const [teams, total] = await Promise.all([
    Team.find(filter)
      .populate(teamPopulate)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    Team.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    teams,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

/**
 * Get team by ID.
 */
export const getTeamById = async ({ companyId, teamId }) => {
  await validateCompany(companyId, {
    requireActive: false,
  });

  const team = await findTeamOrFail(companyId, teamId, {
    populate: true,
    lean: true,
  });

  const assignedMemberCount = await CompanyAccess.countDocuments({
    companyId,
    teamId,
    isDeleted: false,
    status: {
      $in: ["ACTIVE", "ONBOARDING"],
    },
  });

  return {
    ...team,
    statistics: {
      teamLeadCount: team.teamLeadIds?.length ?? 0,
      assignedMemberCount,
    },
  };
};

/**
 * Update team.
 */
export const updateTeam = async ({
  companyId,
  teamId,
  payload,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const team = await findTeamOrFail(companyId, teamId);

  const nextDepartmentId = payload.departmentId ?? team.departmentId;

  if (
    payload.departmentId &&
    payload.departmentId.toString() !== team.departmentId.toString()
  ) {
    await validateDepartment({
      companyId,
      departmentId: payload.departmentId,
    });

    const [assignedMember, hasTeamLeads] = await Promise.all([
      CompanyAccess.findOne({
        companyId,
        teamId,
        isDeleted: false,
        status: {
          $in: ["ACTIVE", "ONBOARDING"],
        },
      })
        .select("_id employeeCode")
        .lean(),

      Promise.resolve(team.teamLeadIds.length > 0),
    ]);

    if (assignedMember) {
      throw new ApiError(
        409,
        "The team department cannot be changed while employees are assigned to the team.",
      );
    }

    if (hasTeamLeads) {
      throw new ApiError(
        409,
        "The team department cannot be changed while team leads are assigned.",
      );
    }
  }

  const normalizedName =
    payload.name !== undefined ? normalizeTeamName(payload.name) : undefined;

  const normalizedCode =
    payload.code !== undefined ? normalizeTeamCode(payload.code) : undefined;

  await validateTeamUniqueness({
    companyId,
    departmentId: nextDepartmentId,
    name: normalizedName,
    code: normalizedCode,
    excludeTeamId: teamId,
  });

  if (payload.departmentId !== undefined) {
    team.departmentId = payload.departmentId;
  }

  if (normalizedName !== undefined) {
    team.name = normalizedName;
  }

  if (normalizedCode !== undefined) {
    team.code = normalizedCode;
  }

  if (payload.description !== undefined) {
    team.description = payload.description;
  }

  team.updatedBy = actorUserId;

  await team.save();

  return Team.findById(team._id).populate(teamPopulate).lean();
};

/**
 * Update team status.
 */
export const updateTeamStatus = async ({
  companyId,
  teamId,
  status,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const team = await findTeamOrFail(companyId, teamId);

  if (team.status === status) {
    return Team.findById(team._id).populate(teamPopulate).lean();
  }

  if (status === "ACTIVE") {
    await validateDepartment({
      companyId,
      departmentId: team.departmentId,
      requireActive: true,
    });
  }

  if (status === "INACTIVE") {
    const assignedMember = await CompanyAccess.findOne({
      companyId,
      teamId,
      isDeleted: false,
      status: {
        $in: ["ACTIVE", "ONBOARDING"],
      },
    })
      .select("_id employeeCode")
      .lean();

    if (assignedMember) {
      throw new ApiError(
        409,
        "The team cannot be deactivated while active employees are assigned to it.",
      );
    }
  }

  team.status = status;
  team.updatedBy = actorUserId;

  await team.save();

  return Team.findById(team._id).populate(teamPopulate).lean();
};

/**
 * Assign or replace team leads.
 *
 * Sending an empty array removes all team leads.
 */
export const assignTeamLeads = async ({
  companyId,
  teamId,
  teamLeadIds,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const team = await findTeamOrFail(companyId, teamId);

  if (team.status !== "ACTIVE") {
    throw new ApiError(
      409,
      "Team leads cannot be assigned to an inactive team.",
    );
  }

  await validateDepartment({
    companyId,
    departmentId: team.departmentId,
  });

  await validateTeamLeads({
    companyId,
    departmentId: team.departmentId,
    teamLeadIds,
  });

  team.teamLeadIds = teamLeadIds;
  team.updatedBy = actorUserId;

  await team.save();

  return Team.findById(team._id).populate(teamPopulate).lean();
};

/**
 * Assign members to a team.
 *
 * CompanyAccess is the single source of truth for
 * department and team membership.
 */
export const assignTeamMembers = async ({
  companyId,
  teamId,
  memberIds,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const team = await findTeamOrFail(companyId, teamId);

  if (team.status !== "ACTIVE") {
    throw new ApiError(409, "Members cannot be assigned to an inactive team.");
  }

  await validateDepartment({
    companyId,
    departmentId: team.departmentId,
  });

  const members = await validateTeamMembers({
    companyId,
    memberIds,
  });

  await CompanyAccess.updateMany(
    {
      _id: {
        $in: members.map((member) => member._id),
      },
      companyId,
      isDeleted: false,
    },
    {
      $set: {
        departmentId: team.departmentId,
        teamId: team._id,
        updatedBy: actorUserId,
      },
    },
    {
      runValidators: true,
    },
  );

  const updatedMembers = await CompanyAccess.find({
    _id: {
      $in: members.map((member) => member._id),
    },
    companyId,
    isDeleted: false,
  })
    .select(
      "userId employeeCode designation employmentType status departmentId teamId",
    )
    .populate({
      path: "userId",
      select:
        "firstName middleName lastName displayName email mobile profilePhoto status",
    })
    .populate({
      path: "departmentId",
      select: "name code status",
    })
    .populate({
      path: "teamId",
      select: "name code status",
    })
    .lean();

  return {
    team: await Team.findById(team._id).populate(teamPopulate).lean(),
    members: updatedMembers,
  };
};

/**
 * Remove members from a team.
 *
 * The department assignment remains unchanged.
 */
export const removeTeamMembers = async ({
  companyId,
  teamId,
  memberIds,
  actorUserId = null,
}) => {
  await validateCompany(companyId);

  const team = await findTeamOrFail(companyId, teamId);

  const members = await validateTeamMembers({
    companyId,
    memberIds,
  });

  const membersNotAssignedToTeam = members.filter(
    (member) =>
      !member.teamId || member.teamId.toString() !== teamId.toString(),
  );

  if (membersNotAssignedToTeam.length > 0) {
    throw new ApiError(
      400,
      "One or more selected employees are not assigned to this team.",
    );
  }

  await CompanyAccess.updateMany(
    {
      _id: {
        $in: members.map((member) => member._id),
      },
      companyId,
      teamId,
      isDeleted: false,
    },
    {
      $set: {
        teamId: null,
        updatedBy: actorUserId,
      },
    },
    {
      runValidators: true,
    },
  );

  return {
    teamId: team._id,
    removedMemberIds: members.map((member) => member._id),
    removedCount: members.length,
  };
};

/**
 * Soft delete team.
 */
export const deleteTeam = async ({ companyId, teamId, actorUserId = null }) => {
  await validateCompany(companyId);

  const team = await findTeamOrFail(companyId, teamId);

  const assignedCompanyAccess = await CompanyAccess.findOne({
    companyId,
    teamId,
    isDeleted: false,
    status: {
      $in: ["ACTIVE", "ONBOARDING"],
    },
  })
    .select("_id employeeCode userId")
    .lean();

  if (assignedCompanyAccess) {
    throw new ApiError(
      409,
      "The team cannot be deleted while active employees are assigned to it.",
    );
  }

  team.status = "INACTIVE";
  team.isDeleted = true;
  team.deletedAt = new Date();
  team.deletedBy = actorUserId;
  team.updatedBy = actorUserId;

  await team.save();

  return true;
};
