import CompanyAccess from "../company-access/companyAccess.model.js";
import Team from "../teams/team.model.js";

/**
 * ============================================================
 * LEAVE SCOPE
 * ============================================================
 *
 * Permission answers:
 *   "Can this user perform this leave action?"
 *
 * Scope answers:
 *   "Whose leave data may this user access/manage?"
 *
 * These are intentionally separate concerns.
 */

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const toObjectIdString = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value?._id) {
    return String(value._id);
  }

  return String(value);
};

const idsEqual = (first, second) => {
  if (!first || !second) {
    return false;
  }

  return toObjectIdString(first) === toObjectIdString(second);
};

const uniqueObjectIds = (values = []) => {
  const seen = new Set();

  return values.filter((value) => {
    if (!value) {
      return false;
    }

    const key = toObjectIdString(value);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

const companyAccessBelongsToCompany = async ({
  companyId,
  companyAccessId,
  session = null,
}) => {
  const query = CompanyAccess.exists({
    _id: companyAccessId,
    companyId,
    isDeleted: false,
  });

  if (session) {
    query.session(session);
  }

  return Boolean(await query);
};

/**
 * ============================================================
 * REQUESTER CONTEXT
 * ============================================================
 */

export const getLeaveRequesterContext = (req) => {
  const user = req?.user;

  if (!user) {
    throw new Error("Authenticated requester context is required.");
  }

  const companyAccess = user.companyAccess || null;

  const accessType = user.accessType || (companyAccess ? "COMPANY" : null);

  const companyId =
    user.companyId ||
    companyAccess?.companyId?._id ||
    companyAccess?.companyId ||
    null;

  const companyAccessId =
    user.companyAccessId || user.accessId || companyAccess?._id || null;

  const roleScopeType =
    user.roleScopeType || companyAccess?.roleId?.scopeType || null;

  const departmentId =
    companyAccess?.departmentId?._id || companyAccess?.departmentId || null;

  const teamId = companyAccess?.teamId?._id || companyAccess?.teamId || null;

  return {
    userId: user.userId || user.user?._id || null,

    accessType,

    companyId,

    companyAccessId,

    roleId:
      user.roleId ||
      companyAccess?.roleId?._id ||
      companyAccess?.roleId ||
      null,

    roleCode: user.roleCode || companyAccess?.roleId?.code || null,

    roleScopeType,

    departmentId,

    teamId,

    permissionCodes: user.permissionCodes || [],

    companyAccess,
  };
};

/**
 * ============================================================
 * SELF CHECK
 * ============================================================
 */

export const isSelfCompanyAccess = (requesterContext, companyAccessId) =>
  idsEqual(requesterContext?.companyAccessId, companyAccessId);

/**
 * ============================================================
 * MANAGED TEAMS
 * ============================================================
 *
 * Team.teamLeadIds stores CompanyAccess IDs.
 *
 * A Team Lead may manage more than one team, so we must not
 * rely only on requesterContext.teamId.
 */

export const getManagedLeaveTeamIds = async ({
  companyId,
  companyAccessId,
  session = null,
}) => {
  if (!companyId || !companyAccessId) {
    return [];
  }

  const query = Team.find({
    companyId,
    teamLeadIds: companyAccessId,
    status: "ACTIVE",
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (session) {
    query.session(session);
  }

  const teams = await query;

  return teams.map((team) => team._id);
};

/**
 * ============================================================
 * READABLE COMPANY ACCESS FILTER
 * ============================================================
 *
 * GLOBAL     -> selected company
 * COMPANY    -> whole company
 * DEPARTMENT -> own department
 * TEAM       -> managed teams + self
 * fallback   -> self only
 */

export const buildReadableLeaveCompanyAccessFilter = async ({
  requesterContext,
  companyId,
  session = null,
}) => {
  if (!requesterContext) {
    throw new Error("Requester context is required.");
  }

  if (!companyId) {
    throw new Error("Company is required.");
  }

  if (
    requesterContext.accessType === "GLOBAL" ||
    requesterContext.roleScopeType === "GLOBAL"
  ) {
    return {
      companyId,
      isDeleted: false,
    };
  }

  /**
   * Defensive tenant check.
   */
  if (
    requesterContext.companyId &&
    !idsEqual(requesterContext.companyId, companyId)
  ) {
    return {
      _id: {
        $in: [],
      },
    };
  }

  switch (requesterContext.roleScopeType) {
    case "COMPANY":
      return {
        companyId,
        isDeleted: false,
      };

    case "DEPARTMENT": {
      if (!requesterContext.departmentId) {
        return {
          _id: {
            $in: [],
          },
        };
      }

      return {
        companyId,
        departmentId: requesterContext.departmentId,
        isDeleted: false,
      };
    }

    case "TEAM": {
      const managedTeamIds = await getManagedLeaveTeamIds({
        companyId,
        companyAccessId: requesterContext.companyAccessId,
        session,
      });

      const conditions = [];

      if (managedTeamIds.length > 0) {
        conditions.push({
          teamId: {
            $in: managedTeamIds,
          },
        });
      }

      /**
       * Team Lead can always read their own leave.
       */
      if (requesterContext.companyAccessId) {
        conditions.push({
          _id: requesterContext.companyAccessId,
        });
      }

      if (conditions.length === 0) {
        return {
          _id: {
            $in: [],
          },
        };
      }

      return {
        companyId,
        isDeleted: false,
        $or: conditions,
      };
    }

    default: {
      /**
       * Unknown/missing scope fails closed to self.
       */
      if (!requesterContext.companyAccessId) {
        return {
          _id: {
            $in: [],
          },
        };
      }

      return {
        companyId,
        _id: requesterContext.companyAccessId,
        isDeleted: false,
      };
    }
  }
};

/**
 * ============================================================
 * READABLE COMPANY ACCESS IDS
 * ============================================================
 */

export const getReadableLeaveCompanyAccessIds = async ({
  requesterContext,
  companyId,
  session = null,
}) => {
  const filter = await buildReadableLeaveCompanyAccessFilter({
    requesterContext,
    companyId,
    session,
  });

  const query = CompanyAccess.find(filter).select("_id").lean();

  if (session) {
    query.session(session);
  }

  const accesses = await query;

  return uniqueObjectIds(accesses.map((access) => access._id));
};

/**
 * ============================================================
 * LEAVE REQUEST READ FILTER
 * ============================================================
 *
 * LeaveRequest stores companyAccessId directly, so this filter
 * can later be merged into LeaveRequest.find().
 */

export const buildLeaveRequestReadFilter = async ({
  requesterContext,
  companyId,
  session = null,
}) => {
  if (
    requesterContext.accessType === "GLOBAL" ||
    requesterContext.roleScopeType === "GLOBAL" ||
    requesterContext.roleScopeType === "COMPANY"
  ) {
    return {
      companyId,
      isDeleted: false,
    };
  }

  const companyAccessIds = await getReadableLeaveCompanyAccessIds({
    requesterContext,
    companyId,
    session,
  });

  return {
    companyId,
    companyAccessId: {
      $in: companyAccessIds,
    },
    isDeleted: false,
  };
};

/**
 * ============================================================
 * CAN READ SPECIFIC EMPLOYEE'S LEAVE
 * ============================================================
 */

export const canAccessLeaveCompanyAccess = async ({
  requesterContext,
  companyId,
  targetCompanyAccessId,
  session = null,
}) => {
  if (!targetCompanyAccessId) {
    return false;
  }

  if (
    requesterContext.accessType === "GLOBAL" ||
    requesterContext.roleScopeType === "GLOBAL" ||
    requesterContext.roleScopeType === "COMPANY"
  ) {
    return companyAccessBelongsToCompany({
      companyId,
      companyAccessId: targetCompanyAccessId,
      session,
    });
  }

  if (isSelfCompanyAccess(requesterContext, targetCompanyAccessId)) {
    return true;
  }

  const filter = await buildReadableLeaveCompanyAccessFilter({
    requesterContext,
    companyId,
    session,
  });

  const query = CompanyAccess.exists({
    ...filter,
    _id: targetCompanyAccessId,
  });

  if (session) {
    query.session(session);
  }

  return Boolean(await query);
};

/**
 * ============================================================
 * MANAGERIAL LEAVE SCOPE
 * ============================================================
 *
 * Used for actions such as:
 *
 * - recommend leave
 * - approve leave
 * - reject leave
 * - review approved-leave cancellation
 *
 * Permissions must still be enforced separately by authorize().
 *
 * allowSelf defaults to false because managerial workflow
 * actions should not automatically allow a manager to approve
 * or recommend their own leave.
 */

export const canManageLeaveCompanyAccess = async ({
  requesterContext,
  companyId,
  targetCompanyAccessId,
  allowSelf = false,
  session = null,
}) => {
  if (!targetCompanyAccessId) {
    return false;
  }

  const isSelf = isSelfCompanyAccess(requesterContext, targetCompanyAccessId);

  if (isSelf) {
    return allowSelf;
  }

  if (
    requesterContext.accessType === "GLOBAL" ||
    requesterContext.roleScopeType === "GLOBAL" ||
    requesterContext.roleScopeType === "COMPANY"
  ) {
    return companyAccessBelongsToCompany({
      companyId,
      companyAccessId: targetCompanyAccessId,
      session,
    });
  }

  if (requesterContext.roleScopeType === "DEPARTMENT") {
    if (!requesterContext.departmentId) {
      return false;
    }

    const query = CompanyAccess.exists({
      _id: targetCompanyAccessId,
      companyId,
      departmentId: requesterContext.departmentId,
      isDeleted: false,
    });

    if (session) {
      query.session(session);
    }

    return Boolean(await query);
  }

  if (requesterContext.roleScopeType === "TEAM") {
    const managedTeamIds = await getManagedLeaveTeamIds({
      companyId,
      companyAccessId: requesterContext.companyAccessId,
      session,
    });

    if (!managedTeamIds.length) {
      return false;
    }

    const query = CompanyAccess.exists({
      _id: targetCompanyAccessId,
      companyId,
      teamId: {
        $in: managedTeamIds,
      },
      isDeleted: false,
    });

    if (session) {
      query.session(session);
    }

    return Boolean(await query);
  }

  return false;
};
