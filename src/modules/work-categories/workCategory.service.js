import WorkCategory from "./workCategory.model.js";

import Department from "../departments/department.model.js";
import Team from "../teams/team.model.js";

import { ApiError } from "../../utils/ApiError.js";

/**
 * ============================================================
 * POPULATION
 * ============================================================
 */

const WORK_CATEGORY_POPULATE = [
  {
    path: "companyId",
    select: "name legalName code slug logo status",
  },
  {
    path: "departmentId",
    select: "name code description status",
  },
  {
    path: "teamId",
    select: "name code description status",
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
];

/**
 * ============================================================
 * REGEX HELPER
 * ============================================================
 */

const escapeRegex = (value = "") => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * ============================================================
 * FIND WORK CATEGORY
 * ============================================================
 */

const findWorkCategoryOrFail = async ({ companyId, workCategoryId }) => {
  const workCategory = await WorkCategory.findOne({
    _id: workCategoryId,

    companyId,

    isDeleted: false,
  });

  if (!workCategory) {
    throw new ApiError(404, "Work category not found.");
  }

  return workCategory;
};

/**
 * ============================================================
 * VALIDATE DEPARTMENT
 * ============================================================
 *
 * Ensures the selected department:
 *
 * - exists
 * - belongs to the company
 * - is active
 * - is not deleted
 */

const getValidDepartment = async ({ companyId, departmentId }) => {
  const department = await Department.findOne({
    _id: departmentId,

    companyId,

    status: "ACTIVE",

    isDeleted: false,
  })
    .select("_id companyId name code status")
    .lean();

  if (!department) {
    throw new ApiError(
      400,
      "Selected department is unavailable, inactive or does not belong to this company.",
    );
  }

  return department;
};

/**
 * ============================================================
 * VALIDATE TEAM
 * ============================================================
 *
 * Ensures the selected team:
 *
 * - exists
 * - belongs to the company
 * - belongs to the selected department
 * - is active
 * - is not deleted
 */

const getValidTeam = async ({ companyId, departmentId, teamId }) => {
  const team = await Team.findOne({
    _id: teamId,

    companyId,

    departmentId,

    status: "ACTIVE",

    isDeleted: false,
  })
    .select("_id companyId departmentId name code status")
    .lean();

  if (!team) {
    throw new ApiError(
      400,
      "Selected team is unavailable, inactive or does not belong to the selected department.",
    );
  }

  return team;
};

/**
 * ============================================================
 * VALIDATE DEPARTMENT + TEAM HIERARCHY
 * ============================================================
 */

const ensureValidWorkCategoryScope = async ({
  companyId,
  departmentId,
  teamId,
}) => {
  const department = await getValidDepartment({
    companyId,
    departmentId,
  });

  const team = await getValidTeam({
    companyId,
    departmentId,
    teamId,
  });

  return {
    department,
    team,
  };
};

/**
 * ============================================================
 * DUPLICATE CHECK
 * ============================================================
 *
 * Same name/code cannot exist twice inside the same:
 *
 * company + department + team
 *
 * But another team may have:
 *
 * Team 1 → Creative / CREATIVE
 * Team 2 → Creative / CREATIVE
 *
 * which is valid.
 */

const ensureUniqueWorkCategory = async ({
  companyId,
  departmentId,
  teamId,
  name,
  code,
  excludeWorkCategoryId = null,
}) => {
  const conditions = [];

  if (name) {
    conditions.push({
      name: {
        $regex: `^${escapeRegex(name.trim())}$`,
        $options: "i",
      },
    });
  }

  if (code) {
    conditions.push({
      code: code.trim().toUpperCase(),
    });
  }

  if (conditions.length === 0) {
    return;
  }

  const filter = {
    companyId,

    departmentId,

    teamId,

    isDeleted: false,

    $or: conditions,
  };

  if (excludeWorkCategoryId) {
    filter._id = {
      $ne: excludeWorkCategoryId,
    };
  }

  const duplicate = await WorkCategory.findOne(filter)
    .select("_id name code departmentId teamId")
    .lean();

  if (!duplicate) {
    return;
  }

  if (name && duplicate.name.toLowerCase() === name.trim().toLowerCase()) {
    throw new ApiError(
      409,
      "A work category with the same name already exists in this team.",
    );
  }

  if (code && duplicate.code.toUpperCase() === code.trim().toUpperCase()) {
    throw new ApiError(
      409,
      "A work category with the same code already exists in this team.",
    );
  }

  throw new ApiError(
    409,
    "A work category with the supplied details already exists in this team.",
  );
};

/**
 * ============================================================
 * POPULATED WORK CATEGORY
 * ============================================================
 */

const getPopulatedWorkCategory = async (workCategoryId) => {
  return WorkCategory.findById(workCategoryId)
    .populate(WORK_CATEGORY_POPULATE)
    .lean();
};

/**
 * ============================================================
 * CREATE WORK CATEGORY
 * ============================================================
 */

export const createWorkCategory = async ({
  companyId,
  payload,
  requesterUserId,
}) => {
  /**
   * First validate hierarchy:
   *
   * company
   *   → department
   *       → team
   */
  await ensureValidWorkCategoryScope({
    companyId,

    departmentId: payload.departmentId,

    teamId: payload.teamId,
  });

  /**
   * Prevent duplicate category inside same team.
   */
  await ensureUniqueWorkCategory({
    companyId,

    departmentId: payload.departmentId,

    teamId: payload.teamId,

    name: payload.name,

    code: payload.code,
  });

  const workCategory = await WorkCategory.create({
    companyId,

    departmentId: payload.departmentId,

    teamId: payload.teamId,

    name: payload.name,

    code: payload.code,

    description: payload.description ?? "",

    unitLabel: payload.unitLabel ?? "item",

    workloadWeight: payload.workloadWeight ?? 1,

    status: payload.status ?? "ACTIVE",

    createdBy: requesterUserId,

    updatedBy: requesterUserId,
  });

  return getPopulatedWorkCategory(workCategory._id);
};

/**
 * ============================================================
 * LIST WORK CATEGORIES
 * ============================================================
 */

export const listWorkCategories = async ({ companyId, query }) => {
  const {
    page = 1,

    limit = 10,

    search,

    status,

    departmentId,

    teamId,

    sortBy = "createdAt",

    sortOrder = "desc",
  } = query;

  const filter = {
    companyId,

    isDeleted: false,
  };

  /**
   * ==========================================================
   * FILTERS
   * ==========================================================
   */

  if (status) {
    filter.status = status;
  }

  if (departmentId) {
    filter.departmentId = departmentId;
  }

  if (teamId) {
    filter.teamId = teamId;
  }

  /**
   * If both departmentId + teamId are supplied,
   * validate that they belong together.
   *
   * This prevents callers from requesting an invalid
   * department/team combination.
   */
  if (departmentId && teamId) {
    await ensureValidWorkCategoryScope({
      companyId,

      departmentId,

      teamId,
    });
  }

  /**
   * If only departmentId is provided,
   * ensure department belongs to company.
   */
  if (departmentId && !teamId) {
    await getValidDepartment({
      companyId,

      departmentId,
    });
  }

  /**
   * If only teamId is provided, verify the team belongs
   * to the company.
   *
   * We don't require departmentId in list filters.
   */
  if (teamId && !departmentId) {
    const team = await Team.findOne({
      _id: teamId,

      companyId,

      isDeleted: false,
    })
      .select("_id departmentId status")
      .lean();

    if (!team) {
      throw new ApiError(400, "Selected team does not belong to this company.");
    }
  }

  /**
   * ==========================================================
   * SEARCH
   * ==========================================================
   */

  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");

    filter.$or = [
      {
        name: expression,
      },

      {
        code: expression,
      },

      {
        description: expression,
      },

      {
        unitLabel: expression,
      },
    ];
  }

  /**
   * ==========================================================
   * PAGINATION
   * ==========================================================
   */

  const skip = (page - 1) * limit;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [records, totalRecords] = await Promise.all([
    WorkCategory.find(filter)
      .populate(WORK_CATEGORY_POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    WorkCategory.countDocuments(filter),
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

/**
 * ============================================================
 * GET WORK CATEGORY BY ID
 * ============================================================
 */

export const getWorkCategoryById = async ({ companyId, workCategoryId }) => {
  const workCategory = await WorkCategory.findOne({
    _id: workCategoryId,

    companyId,

    isDeleted: false,
  })
    .populate(WORK_CATEGORY_POPULATE)
    .lean();

  if (!workCategory) {
    throw new ApiError(404, "Work category not found.");
  }

  return workCategory;
};

/**
 * ============================================================
 * UPDATE WORK CATEGORY
 * ============================================================
 */

export const updateWorkCategory = async ({
  companyId,
  workCategoryId,
  payload,
  requesterUserId,
}) => {
  const workCategory = await findWorkCategoryOrFail({
    companyId,

    workCategoryId,
  });

  /**
   * Determine the FINAL department/team combination
   * after applying the requested update.
   *
   * This is important because callers may update:
   *
   * department only
   * team only
   * both
   */
  const finalDepartmentId = payload.departmentId ?? workCategory.departmentId;

  const finalTeamId = payload.teamId ?? workCategory.teamId;

  /**
   * If department/team changed, verify the resulting
   * hierarchy before saving.
   */
  if (payload.departmentId !== undefined || payload.teamId !== undefined) {
    await ensureValidWorkCategoryScope({
      companyId,

      departmentId: finalDepartmentId,

      teamId: finalTeamId,
    });
  }

  /**
   * Duplicate validation needs to use the FINAL
   * department/team combination.
   *
   * Example:
   *
   * Moving Creative from Team 1 → Team 2 must fail
   * if Team 2 already has Creative.
   */
  if (
    payload.name !== undefined ||
    payload.code !== undefined ||
    payload.departmentId !== undefined ||
    payload.teamId !== undefined
  ) {
    await ensureUniqueWorkCategory({
      companyId,

      departmentId: finalDepartmentId,

      teamId: finalTeamId,

      name: payload.name !== undefined ? payload.name : workCategory.name,

      code: payload.code !== undefined ? payload.code : workCategory.code,

      excludeWorkCategoryId: workCategory._id,
    });
  }

  /**
   * ==========================================================
   * APPLY UPDATE
   * ==========================================================
   */

  if (payload.departmentId !== undefined) {
    workCategory.departmentId = payload.departmentId;
  }

  if (payload.teamId !== undefined) {
    workCategory.teamId = payload.teamId;
  }

  if (payload.name !== undefined) {
    workCategory.name = payload.name;
  }

  if (payload.code !== undefined) {
    workCategory.code = payload.code;
  }

  if (payload.description !== undefined) {
    workCategory.description = payload.description;
  }

  if (payload.unitLabel !== undefined) {
    workCategory.unitLabel = payload.unitLabel;
  }

  if (payload.workloadWeight !== undefined) {
    workCategory.workloadWeight = payload.workloadWeight;
  }

  workCategory.updatedBy = requesterUserId;

  await workCategory.save();

  return getPopulatedWorkCategory(workCategory._id);
};

/**
 * ============================================================
 * UPDATE STATUS
 * ============================================================
 */

export const updateWorkCategoryStatus = async ({
  companyId,
  workCategoryId,
  status,
  requesterUserId,
}) => {
  const workCategory = await findWorkCategoryOrFail({
    companyId,

    workCategoryId,
  });

  if (workCategory.status === status) {
    throw new ApiError(
      400,
      `Work category is already ${status.toLowerCase()}.`,
    );
  }

  workCategory.status = status;

  workCategory.updatedBy = requesterUserId;

  await workCategory.save();

  return getPopulatedWorkCategory(workCategory._id);
};

/**
 * ============================================================
 * DELETE WORK CATEGORY
 *
 * Soft delete only.
 * ============================================================
 */

export const deleteWorkCategory = async ({
  companyId,
  workCategoryId,
  requesterUserId,
}) => {
  const workCategory = await findWorkCategoryOrFail({
    companyId,

    workCategoryId,
  });

  const deletedAt = new Date();

  workCategory.isDeleted = true;

  workCategory.deletedAt = deletedAt;

  workCategory.deletedBy = requesterUserId;

  workCategory.updatedBy = requesterUserId;

  await workCategory.save();

  return {
    workCategoryId: workCategory._id,

    deletedAt,
  };
};
