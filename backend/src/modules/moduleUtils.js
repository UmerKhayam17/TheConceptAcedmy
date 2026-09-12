/**
 * Module Permission Utilities
 * Helper functions for managing module-based permissions
 */

const MODULES = require('./moduleConfig');

/**
 * Check if a user has permission for a specific action on a module
 * @param {Object} user - User document
 * @param {String} moduleName - Module name (e.g., 'exam', 'assignment')
 * @param {String} action - Action (e.g., 'view', 'create', 'edit', 'delete')
 * @returns {Boolean}
 */
function hasModulePermission(user, moduleName, action) {
    if (!user || !moduleName || !action) return false;

    // Admin has access to all modules and actions
    if (user.role?.name === 'admin' || user.roleDoc?.name === 'admin') return true;

    const fromMap = (map) => {
      if (!map) return [];
      if (map instanceof Map) return map.get(moduleName) || [];
      return map[moduleName] || [];
    };

    const userActions = fromMap(user.modulePermissions);
    const roleActions = fromMap(user.roleDoc?.modulePermissions || user.role?.modulePermissions);
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

    if (user.role?.name === 'admin' || user.roleDoc?.name === 'admin') return true;

    const fromMap = (map) => {
      if (!map) return [];
      if (map instanceof Map) return map.get(moduleName) || [];
      return map[moduleName] || [];
    };
    const userModulePerms = fromMap(user.modulePermissions);
    const roleModulePerms = fromMap(user.roleDoc?.modulePermissions || user.role?.modulePermissions);
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

    if (user.role?.name === 'admin') {
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

    if (user.role?.name === 'admin') {
        // Return all modules with all their actions
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
    return perms;
}

module.exports = {
    hasModulePermission,
    hasModuleAccess,
    grantModulePermission,
    revokeModulePermission,
    getModulePermissions,
    getAllUserModulePermissions,
    MODULES,
};
