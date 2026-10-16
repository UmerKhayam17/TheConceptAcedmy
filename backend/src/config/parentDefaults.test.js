/**
 * Node built-in test runner: `node --test src/config/parentDefaults.test.js`
 * from the backend directory.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PARENT_DEFAULT_MODULE_PERMISSIONS,
  PARENT_FORBIDDEN_MODULE_KEYS,
  PARENT_PERMISSION_NAMES,
  normalizeParentModulePermissions,
  parentModulePermissionsObject,
} = require('./parentDefaults');

describe('parentDefaults', () => {
  it('canonical matrix is view-only timetable without builder/board', () => {
    assert.deepEqual(PARENT_DEFAULT_MODULE_PERMISSIONS.timetableView, ['view']);
    assert.equal(PARENT_DEFAULT_MODULE_PERMISSIONS.timetableBuilder, undefined);
    assert.equal(PARENT_DEFAULT_MODULE_PERMISSIONS.timetableBoard, undefined);
    assert.deepEqual(PARENT_DEFAULT_MODULE_PERMISSIONS.notifications, ['view']);
    assert.deepEqual(PARENT_DEFAULT_MODULE_PERMISSIONS.schoolCalendar, ['view']);
    assert.ok(PARENT_FORBIDDEN_MODULE_KEYS.includes('timetableBuilder'));
    assert.ok(PARENT_FORBIDDEN_MODULE_KEYS.includes('fee'));
    assert.ok(PARENT_PERMISSION_NAMES.includes('view_academy_students'));
  });

  it('normalizeParentModulePermissions strips forbidden and fills defaults', () => {
    const next = normalizeParentModulePermissions({
      student: ['view'],
      timetableBuilder: ['view'],
      timetableBoard: ['view'],
      fee: ['view'],
      profile: ['view', 'edit'],
    });
    assert.equal(next.has('timetableBuilder'), false);
    assert.equal(next.has('timetableBoard'), false);
    assert.equal(next.has('fee'), false);
    assert.equal(next.has('profile'), false);
    assert.deepEqual(next.get('timetableView'), ['view']);
    assert.deepEqual(next.get('notifications'), ['view']);
    assert.deepEqual(next.get('schoolCalendar'), ['view']);
    assert.deepEqual(next.get('examTests'), ['view']);
  });

  it('parentModulePermissionsObject matches canonical keys', () => {
    const obj = parentModulePermissionsObject();
    assert.deepEqual(Object.keys(obj).sort(), Object.keys(PARENT_DEFAULT_MODULE_PERMISSIONS).sort());
  });
});

describe('parentScope helpers', () => {
  it('assertParentOwnsStudent skips non-parents and denies unknown students', async () => {
    const {
      assertParentOwnsStudent,
      assertNotParent,
      isParentRole,
    } = require('../utils/parentScope');

    const staffReq = { user: { roleDoc: { name: 'teacher' }, email: 't@x.com' } };
    await assertParentOwnsStudent(staffReq, '507f1f77bcf86cd799439011');
    assert.equal(isParentRole(staffReq), false);

    assert.throws(() => assertNotParent({ user: { roleDoc: { name: 'parent' } } }, 'nope'), (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    });
  });
});
