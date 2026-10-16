/**
 * Expand legacy coarse module keys (exam, config, studentManagement, timetable)
 * into leaf submodule keys so existing grants keep working after the RBAC split.
 */

const { LEGACY_MODULE_EXPANSION } = require('../config/systemModules');

function toPlain(modulePermissions) {
  if (!modulePermissions) return {};
  if (modulePermissions instanceof Map) {
    return Object.fromEntries(modulePermissions);
  }
  if (typeof modulePermissions === 'object' && !Array.isArray(modulePermissions)) {
    return { ...modulePermissions };
  }
  return {};
}

function mergeActions(a, b) {
  return [...new Set([...(a || []), ...(b || [])])];
}

/**
 * @param {Record<string, string[]>|Map} modulePermissions
 * @returns {Record<string, string[]>}
 */
function expandModulePermissions(modulePermissions) {
  const plain = toPlain(modulePermissions);
  const out = { ...plain };

  Object.entries(LEGACY_MODULE_EXPANSION).forEach(([legacyKey, leaves]) => {
    const actions = plain[legacyKey];
    if (!Array.isArray(actions) || actions.length === 0) return;
    leaves.forEach((leaf) => {
      out[leaf] = mergeActions(out[leaf], actions);
    });
  });

  return out;
}

/**
 * Resolve actions for a module key, including legacy parent expansion.
 * e.g. checking `examTests` also sees actions from legacy `exam`.
 */
function actionsForModule(modulePermissions, moduleName) {
  const plain = toPlain(modulePermissions);
  let actions = Array.isArray(plain[moduleName]) ? [...plain[moduleName]] : [];

  Object.entries(LEGACY_MODULE_EXPANSION).forEach(([legacyKey, leaves]) => {
    if (!leaves.includes(moduleName)) return;
    const legacyActions = plain[legacyKey];
    if (Array.isArray(legacyActions) && legacyActions.length) {
      actions = mergeActions(actions, legacyActions);
    }
  });

  // Checking a coarse parent: union of parent + all leaves (for shared API routes).
  const leaves = LEGACY_MODULE_EXPANSION[moduleName];
  if (leaves) {
    leaves.forEach((leaf) => {
      if (Array.isArray(plain[leaf]) && plain[leaf].length) {
        actions = mergeActions(actions, plain[leaf]);
      }
    });
  }

  return actions;
}

module.exports = {
  expandModulePermissions,
  actionsForModule,
  toPlainModulePermissions: toPlain,
};
