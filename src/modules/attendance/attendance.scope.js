import mongoose from "mongoose";

import CompanyAccess from "../company-access/companyAccess.model.js";
import Team from "../teams/team.model.js";

/**
 * ============================================================
 * ATTENDANCE SCOPE
 * ============================================================
 *
 * Determines which employees / CompanyAccess records the
 * authenticated requester may access.
 *
 * IMPORTANT:
 *
 * Permission answers:
 *   "Can this user perform attendance.read?"
 *
 * Scope answers:
 *   "Whose attendance may this user read?"
 *
 * Those are intentionally separate concerns.
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

const idsEqual = (first, second) => {
  if (!first || !second) {
    return false;
  }

  return toObjectIdString(first) === toObjectIdString(second);
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
 *
 * authenticate.middleware.js already gives us most of this.
 *
 * We normalize it here so attendance services do not need
 * to repeatedly inspect req.user.
 */

export const getAttendanceRequesterContext = (req) => {
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
 * TEAM LEAD - MANAGED TEAMS
 * ============================================================
 *
 * Team.teamLeadIds contains CompanyAccess IDs.
 *
 * A Team Lead may potentially lead more than one team,
 * therefore we do NOT rely only on:
 *
 * companyAccess.teamId
 */

export const getManagedTeamIds = async ({
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
 * Returns a MongoDB filter for CompanyAccess.
 *
 * GLOBAL
 *   -> company context
 *
 * COMPANY
 *   -> whole company
 *
 * DEPARTMENT
 *   -> own department
 *
 * TEAM
 *   -> managed teams + self
 *
 * Unknown scope
 *   -> self only
 *
 * Why include self for TEAM?
 *
 * A Team Lead should always be able to see their own
 * attendance even if they are not stored as a normal member
 * of one of the teams they lead.
 */

export const buildReadableCompanyAccessFilter = async ({
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

  /**
   * GLOBAL users are still constrained to the company
   * supplied by the nested route.
   *
   * This prevents accidentally returning records from every
   * tenant when accessing:
   *
   * /companies/:companyId/attendance
   */
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
   * Company context must match.
   *
   * enforceCompanyContext middleware should already enforce
   * this, but keeping scope defensive is useful.
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
        /**
         * Misconfigured department-scoped user.
         *
         * Fail closed instead of exposing company data.
         */
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
      const managedTeamIds = await getManagedTeamIds({
        companyId,
        companyAccessId: requesterContext.companyAccessId,
        session,
      });

      const ownAccessId = requesterContext.companyAccessId;

      const conditions = [];

      if (managedTeamIds.length > 0) {
        conditions.push({
          teamId: {
            $in: managedTeamIds,
          },
        });
      }

      if (ownAccessId) {
        conditions.push({
          _id: ownAccessId,
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
       * Unknown/missing scope = fail closed to self.
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
 * GET READABLE COMPANY ACCESS IDS
 * ============================================================
 *
 * Attendance stores companyAccessId directly.
 *
 * Therefore attendance services can turn the scope above into:
 *
 * {
 *   companyAccessId: { $in: [...] }
 * }
 */

export const getReadableCompanyAccessIds = async ({
  requesterContext,
  companyId,
  session = null,
}) => {
  const filter = await buildReadableCompanyAccessFilter({
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
 * ATTENDANCE READ FILTER
 * ============================================================
 *
 * Can be merged directly into Attendance.find().
 */

export const buildAttendanceReadFilter = async ({
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

  const companyAccessIds = await getReadableCompanyAccessIds({
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
 * FIELD VISIT READ FILTER
 * ============================================================
 */

export const buildFieldVisitReadFilter = async ({
  requesterContext,
  companyId,
  session = null,
}) =>
  buildAttendanceReadFilter({
    requesterContext,
    companyId,
    session,
  });

/**
 * ============================================================
 * REGULARIZATION READ FILTER
 * ============================================================
 */

export const buildRegularizationReadFilter = async ({
  requesterContext,
  companyId,
  session = null,
}) =>
  buildAttendanceReadFilter({
    requesterContext,
    companyId,
    session,
  });

/**
 * ============================================================
 * CAN ACCESS SPECIFIC EMPLOYEE
 * ============================================================
 *
 * Useful for:
 *
 * GET attendance/:attendanceId
 * GET field-visits/:fieldVisitId
 * GET regularizations/:regularizationId
 */

export const canAccessCompanyAccess = async ({
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

  const filter = await buildReadableCompanyAccessFilter({
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
 * SELF-SERVICE ATTENDANCE IDENTITY
 * ============================================================
 *
 * VERY IMPORTANT:
 *
 * check-in
 * check-out
 * start break
 * end break
 * start field visit
 *
 * must NEVER accept arbitrary employeeId/companyAccessId from
 * the frontend.
 *
 * Identity comes exclusively from authentication.
 */

export const getSelfAttendanceIdentity = ({ requesterContext, companyId }) => {
  if (!requesterContext) {
    throw new Error("Requester context is required.");
  }

  if (requesterContext.accessType === "GLOBAL") {
    throw new Error(
      "Global access cannot perform employee self-service attendance actions.",
    );
  }

  if (!requesterContext.companyAccessId) {
    throw new Error("Company access is required for attendance self-service.");
  }

  if (
    requesterContext.companyId &&
    !idsEqual(requesterContext.companyId, companyId)
  ) {
    throw new Error(
      "Attendance company context does not match authenticated company access.",
    );
  }

  return {
    companyId,
    companyAccessId: requesterContext.companyAccessId,
    userId: requesterContext.userId,
  };
};

/**
 * ============================================================
 * MANAGERIAL SCOPE CHECK
 * ============================================================
 *
 * Useful later for:
 *
 * - correction recommendation
 * - attendance adjustments
 *
 * This checks scope only.
 *
 * Permissions must STILL be checked by authorize middleware.
 */

export const canManageCompanyAccess = async ({
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
    const managedTeamIds = await getManagedTeamIds({
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

/**
 * ============================================================
 * OBJECT ID UTILITY
 * ============================================================
 */

export const toObjectId = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof mongoose.Types.ObjectId) {
    return value;
  }

  if (!mongoose.Types.ObjectId.isValid(value)) {
    return null;
  }

  return new mongoose.Types.ObjectId(value);
};
