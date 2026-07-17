import Permission from "./permission.model.js";

export const getPermissions = async ({ module, status = "ACTIVE" } = {}) => {
  const filter = {};

  if (module) {
    filter.module = module.toLowerCase();
  }

  if (status) {
    filter.status = status;
  }

  return Permission.find(filter).sort({ module: 1, action: 1 }).lean();
};

export const getGroupedPermissions = async () => {
  const permissions = await Permission.find({
    status: "ACTIVE",
  })
    .sort({ module: 1, action: 1 })
    .lean();

  return permissions.reduce((groups, permission) => {
    if (!groups[permission.module]) {
      groups[permission.module] = [];
    }

    groups[permission.module].push(permission);

    return groups;
  }, {});
};

export const findPermissionsByCodes = async (codes) => {
  return Permission.find({
    code: { $in: codes },
    status: "ACTIVE",
  });
};
