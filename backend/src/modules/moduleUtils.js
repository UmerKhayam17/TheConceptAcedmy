/**
 * Module Permission Utilities
 * Helper functions for managing module-based permissions
 */

const MODULES = require('./moduleConfig');
const { isSystemAdmin, isAdminRole } = require('../utils/systemAdmin');
const { actionsForModule, expandModulePermissions } = require('./expandModulePermissions');

function fromMap(map, moduleName) {
  if (!map) return [];
  return actionsForModule(map, moduleName);
}

function hasExplicitModulePermissions(map) {
  if (!map) return false;
  if (map instanceof Map) {
    for (const actions of map.values()) {
      if (Array.isArray(actions) && actions.length > 0) return true;
    }
    return false;
  }
  return Object.values(map).some((actions) => Array.isArray(actions) && actions.length > 0);
}

/**
 * Check if a user has permission for a specific action on a module
 * @param {Object} user - User document
 * @param {String} moduleName - Module name (e.g., 'exam', 'assignment')
 * @param {String} action - Action (e.g., 'view', 'create', 'edit', 'delete')
 * @returns {Boolean}
 */
function hasModulePermission(user, moduleName, action) {
  if (!user || !moduleName || !action) return false;

  // Only the seeded system admin bypasses the matrix.
  if (isSystemAdmin(user)) return true;

  const userActions = fromMap(user.modulePermissions, moduleName);
  // Secondary admins: only their own dynamic modulePermissions.
  if (isAdminRole(user)) {
    return Array.isArray(userActions) && userActions.includes(action);
  }

  const roleActions = fromMap(user.roleDoc?.modulePermissions || user.role?.modulePermissions, moduleName);
  if (hasExplicitModulePermissions(user.modulePermissions)) {
    return Array.isArray(userActions) && userActions.includes(action);
  }
  const actions = [...new Set([...(userActions || []), ...(roleActions || [])])];
  return Array.isArray(actions) && actions.includes(action);
}

/**
 * Check if a user has any permission for a module
 * @param {Object} user - User document
 * @param {String} moduleName - Module name
 * @returns {Boolean}
 */
function hasModuleAccess(user, moduleName) {
  if (!user || !moduleName) return false;

  if (isSystemAdmin(user)) return true;

  const userModulePerms = fromMap(user.modulePermissions, moduleName);
  if (isAdminRole(user)) {
    return userModulePerms.length > 0;
  }

  if (hasExplicitModulePermissions(user.modulePermissions)) {
    return userModulePerms.length > 0;
  }
  const roleModulePerms = fromMap(
    user.roleDoc?.modulePermissions || user.role?.modulePermissions,
    moduleName,
  );
  return [...userModulePerms, ...roleModulePerms].length > 0;
}

/**
 * Grant module permissions to a user
 * @param {Object} user - User document
 * @param {String} moduleName - Module name
 * @param {Array<String>} actions - Array of actions to grant
 * @returns {Object} Updated modulePermissions
 */
function grantModulePermission(user, moduleName, actions) {
  if (!user || !moduleName || !Array.isArray(actions)) return user.modulePermissions;

  const modulePerms = user.modulePermissions || new Map();
  const currentActions = modulePerms.get?.(moduleName) || modulePerms[moduleName] || [];

  // Merge new actions with existing ones (avoid duplicates)
  const mergedActions = [...new Set([...currentActions, ...actions])];

  // Validate actions against module definition
  const module = MODULES[moduleName];
  if (module) {
    const validActions = mergedActions.filter((a) => module.actions.includes(a));
    modulePerms.set(moduleName, validActions);
  } else {
    modulePerms.set(moduleName, mergedActions);
  }

  return modulePerms;
}

/**
 * Revoke module permissions from a user
 * @param {Object} user - User document
 * @param {String} moduleName - Module name
 * @param {Array<String>} actions - Array of actions to revoke
 * @returns {Object} Updated modulePermissions
 */
function revokeModulePermission(user, moduleName, actions) {
  if (!user || !moduleName || !Array.isArray(actions)) return user.modulePermissions;

  const modulePerms = user.modulePermissions || new Map();
  const currentActions = modulePerms.get?.(moduleName) || modulePerms[moduleName] || [];

  const remainingActions = currentActions.filter((a) => !actions.includes(a));

  if (remainingActions.length === 0) {
    modulePerms.delete?.(moduleName);
  } else {
    modulePerms.set(moduleName, remainingActions);
  }

  return modulePerms;
}

/**
 * Get all permissions for a user for a specific module
 * @param {Object} user - User document
 * @param {String} moduleName - Module name
 * @returns {Array<String>}
 */
function getModulePermissions(user, moduleName) {
  if (!user || !moduleName) return [];

  if (isSystemAdmin(user)) {
    const module = MODULES[moduleName];
    return module ? module.actions : [];
  }

  const userModulePerms = user.modulePermissions?.get?.(moduleName) || user.modulePermissions?.[moduleName] || [];
  return Array.isArray(userModulePerms) ? userModulePerms : [];
}

/**
 * Get all modules and their permissions for a user
 * @param {Object} user - User document
 * @returns {Object}
 */
function getAllUserModulePermissions(user) {
  if (!user) return {};

  if (isSystemAdmin(user)) {
    const allPerms = {};
    Object.keys(MODULES).forEach((moduleName) => {
      allPerms[moduleName] = MODULES[moduleName].actions;
    });
    return allPerms;
  }

  const perms = {};
  if (user.modulePermissions instanceof Map) {
    user.modulePermissions.forEach((actions, moduleName) => {
      perms[moduleName] = actions;
    });
  } else {
    Object.keys(user.modulePermissions || {}).forEach((moduleName) => {
      perms[moduleName] = user.modulePermissions[moduleName];
    });
  }
  return expandModulePermissions(perms);
}

module.exports = {
  hasModulePermission,
  hasModuleAccess,
  grantModulePermission,
  revokeModulePermission,
  getModulePermissions,
  getAllUserModulePermissions,
  expandModulePermissions,
  MODULES,
};
