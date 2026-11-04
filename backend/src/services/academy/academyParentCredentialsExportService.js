const Role = require('../../models/Role');
const User = require('../../models/User');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const { expandModulePermissions } = require('../../modules/expandModulePermissions');
const { DEFAULT_PARENT_PASSWORD } = require('./academyStudentService');
const { renderBrandedExcel } = require('./academyReportDocument');
const { renderDualTablePdf } = require('./academyStudentExportService');

const COLUMNS = [
  { key: 'name', header: 'Full Name', excelWidth: 28, pdfWidth: 120, align: 'left', wrap: true },
  { key: 'email', header: 'Email', excelWidth: 42, pdfWidth: 180, align: 'left', wrap: true },
  { key: 'password', header: 'Password', excelWidth: 20, pdfWidth: 90, align: 'left', wrap: false },
];

function todayLabel() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function moduleKeys(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const plain = raw instanceof Map ? Object.fromEntries(raw) : raw;
  try {
    return expandModulePermissions(plain) || {};
  } catch {
    return plain;
  }
}

function matchesFilters(row, query) {
  const status = String(query.status || '').trim().toLowerCase();
  if (status === 'active' && !row.isActive) return false;
  if (status === 'inactive' && row.isActive) return false;

  const moduleFilter = String(query.module || '').trim();
  if (moduleFilter && !(moduleFilter in row.modules)) return false;

  const classId = String(query.classId || '').trim();
  const sectionId = String(query.sectionId || '').trim();
  if (classId || sectionId) {
    const hit = row.linked.some((s) => {
      if (classId && String(s.classId || '') !== classId) return false;
      if (sectionId && String(s.sectionId || '') !== sectionId) return false;
      return true;
    });
    if (!hit) return false;
  }

  const q = String(query.search || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.name,
    row.email,
    row.phone,
    row.isActive ? 'active' : 'inactive',
    ...Object.keys(row.modules),
    ...row.linked.flatMap((s) => [s.studentName, s.studentId, s.className, s.sectionName]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

async function loadParentRows(query = {}) {
  const parentRole = await Role.findOne({ name: 'parent' }).select('_id');
  if (!parentRole) return [];

  const users = await User.find({ role: parentRole._id })
    .select('+issuedPassword name email phone isActive modulePermissions')
    .sort({ name: 1 })
    .lean();

  const emails = users.map((u) => String(u.email || '').trim().toLowerCase()).filter(Boolean);
  const students = emails.length
    ? await AcademyStudent.find({ guardianEmail: { $in: emails } })
        .select('studentId studentName guardianEmail classId sectionId')
        .populate('classId', 'className')
        .populate('sectionId', 'sectionName')
        .lean()
    : [];

  const byEmail = new Map();
  students.forEach((s) => {
    const email = String(s.guardianEmail || '').trim().toLowerCase();
    if (!email) return;
    const classId =
      s.classId && typeof s.classId === 'object' ? s.classId._id : s.classId;
    const sectionId =
      s.sectionId && typeof s.sectionId === 'object' ? s.sectionId._id : s.sectionId;
    const row = {
      studentId: s.studentId,
      studentName: s.studentName,
      classId: classId ? String(classId) : '',
      sectionId: sectionId ? String(sectionId) : '',
      className: s.classId?.className || '',
      sectionName: s.sectionId?.sectionName || '',
    };
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(row);
  });

  return users
    .map((u) => {
      const email = String(u.email || '').trim().toLowerCase();
      return {
        name: String(u.name || '').trim(),
        email,
        phone: String(u.phone || '').trim(),
        password: String(u.issuedPassword || '').trim() || DEFAULT_PARENT_PASSWORD,
        isActive: u.isActive !== false,
        modules: moduleKeys(u.modulePermissions),
        linked: byEmail.get(email) || [],
      };
    })
    .filter((row) => matchesFilters(row, query))
    .map((row) => ({
      name: row.name,
      email: row.email,
      password: row.password,
    }));
}

function buildCols(tableW) {
  const name = Math.round(tableW * 0.3);
  const password = Math.round(tableW * 0.24);
  const email = tableW - name - password;
  return [
    { key: 'name', label: 'Full Name', w: name, align: 'left', wrap: true },
    { key: 'email', label: 'Email', w: email, align: 'left', wrap: true },
    { key: 'password', label: 'Password', w: password, align: 'left', wrap: true },
  ];
}

async function exportParentCredentials(format, query = {}) {
  const rows = await loadParentRows(query);
  const countLabel = `${rows.length} parent${rows.length === 1 ? '' : 's'}`;
  const meta = {
    leftFilter: 'Parent portal',
    centerFilter: todayLabel(),
    rightFilter: countLabel,
    countLabel,
  };

  if (format === 'xlsx') {
    const buffer = await renderBrandedExcel({
      title: 'Parent Portal Logins',
      sheetName: 'Parent Logins',
      columns: COLUMNS,
      rows,
      meta,
      plain: true,
      lightHeader: true,
      layout: 'portrait',
    });
    return { buffer, filename: 'Parent-Logins.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  const buffer = await renderDualTablePdf({
    title: 'Parent Portal Logins',
    subject: 'Parent full name, email, and password',
    emptyMessage: 'No parent accounts match this list.',
    rows,
    meta,
    buildCols,
  });
  return { buffer, filename: 'Parent-Logins.pdf', contentType: 'application/pdf' };
}

module.exports = { exportParentCredentials };
