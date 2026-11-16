import { PERMISSIONS } from "./permissions.constants.js";

export const PERMISSION_APPLICABILITY = Object.freeze({
  GLOBAL: "GLOBAL",
  COMPANY: "COMPANY",
  BOTH: "BOTH",
});

/**
 * Permissions exclusively used for platform-level
 * company lifecycle management.
 *
 * All other existing permissions are classified
 * as BOTH until their intended scope is explicitly
 * narrowed during the authorization audit.
 */
export const GLOBAL_ONLY_PERMISSION_CODES = Object.freeze([
  PERMISSIONS.COMPANY_CREATE,
  PERMISSIONS.COMPANY_READ,
  PERMISSIONS.COMPANY_UPDATE,
  PERMISSIONS.COMPANY_DEACTIVATE,
]);

const globalOnlyPermissionSet = new Set(GLOBAL_ONLY_PERMISSION_CODES);

export const getPermissionApplicability = (code) => {
  if (globalOnlyPermissionSet.has(code)) {
    return PERMISSION_APPLICABILITY.GLOBAL;
  }

  return PERMISSION_APPLICABILITY.BOTH;
};
