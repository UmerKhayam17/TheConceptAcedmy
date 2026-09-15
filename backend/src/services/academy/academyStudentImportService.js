const ExcelJS = require('exceljs');
const ApiError = require('../../utils/ApiError');
const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySection = require('../../models/academy/AcademySection');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const Session = require('../../models/Session');
const studentService = require('./academyStudentService');
const sectionService = require('./academySectionService');
const { getAllowedSubjects } = require('./academyEnrollmentSubjectService');

const MAX_ROWS = 2000;

const HEADER_ALIASES = {
  serial: ['sr#', 'sr', 's.no', 's no', 'sno', 'serial', 'sr no'],
  registrationNumber: ['reg no', 'regno', 'reg #', 'registration no', 'registration number', 'reg'],
  studentName: ['student name', 'studentname', 'name', 'student'],
  fatherName: ['father name', 'fathername', 'father', 'parent name'],
  phone: ['phone', 'mobile', 'contact', 'phone number', 'mobile number', 'mobile no'],
  dateOfBirth: ['date of birth', 'dob', 'dateofbirth', 'birth date', 'birthday'],
  className: ['class', 'class name', 'classname', 'grade'],
  sectionName: ['section', 'section name', 'sec'],
  discipline: [
    'discipline',
    'disiplane',
    'desiplane',
    'group',
    'stream',
    'faculty',
    'admission class',
    'admissionclass',
    'admitted class',
  ],
  description: ['notes', 'note', 'description', 'intake notes', 'remarks'],
  subjects: ['subjects', 'subject', 'subject names', 'selected subjects', 'courses'],
};

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_/#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapHeader(value) {
  const key = normalizeHeader(value);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

function cellToRaw(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text || '').join('');
    }
    if (value.text != null) return value.text;
    if (value.result != null) return cellToRaw(value.result);
    if (value.hyperlink != null) return value.text || value.hyperlink;
  }
  return String(value);
}

function cellToString(value) {
  const raw = cellToRaw(value);
  if (raw instanceof Date) return '';
  if (typeof raw === 'number') return String(raw);
  return String(raw || '').trim();
}

function excelSerialToDate(serial) {
  const utc = Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000);
  return new Date(utc);
}

function parseDateOfBirth(value) {
  const raw = cellToRaw(value);
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const dt = excelSerialToDate(raw);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const text = String(raw || '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const dt = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(value) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : value;
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.startsWith('92') && d.length >= 11) d = `0${d.slice(2)}`;
  if (d.startsWith('3')) d = `0${d}`;
  if (!d.startsWith('03') || d.length < 10 || d.length > 12) return null;
  if (d.length === 11) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}

function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c || '').trim()));
}

function rowsToRecords(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => mapHeader(cellToString(h) || h));
  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i];
    const rec = { _row: i + 1 };
    headers.forEach((field, idx) => {
      if (!field) return;
      rec[field] = line[idx];
    });
    const hasAny = [
      'studentName',
      'fatherName',
      'phone',
      'className',
      'registrationNumber',
      'sectionName',
      'discipline',
    ].some((k) => cellToString(rec[k]));
    if (hasAny) records.push(rec);
  }
  return records;
}

function sheetToGrid(sheet) {
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    const count = Math.max(row.cellCount, 16);
    for (let c = 1; c <= count; c += 1) {
      values.push(row.getCell(c).value);
    }
    if (values.some((v) => cellToString(v) !== '' || v instanceof Date || typeof v === 'number')) {
      rows.push(values);
    }
  });
  return rows;
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const records = [];
  for (const sheet of workbook.worksheets) {
    if (!sheet || !sheet.actualRowCount) continue;
    const grid = sheetToGrid(sheet);
    if (!grid.length) continue;
    const headers = grid[0].map((h) => mapHeader(cellToString(h) || h));
    if (!headers.includes('studentName')) continue;
    const prefix = workbook.worksheets.length > 1 ? `${sheet.name} ` : '';
    rowsToRecords(grid).forEach((rec) => {
      records.push({ ...rec, _row: `${prefix}${rec._row}`.trim() });
    });
  }
  return records;
}

async function parseUpload(file) {
  if (!file?.buffer?.length) throw new ApiError(400, 'Spreadsheet file is required');
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.csv') || /csv/i.test(file.mimetype || '')) {
    return rowsToRecords(parseCsv(file.buffer.toString('utf8')));
  }
  try {
    return await parseXlsx(file.buffer);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'Could not read this spreadsheet. Use the .xlsx template or a CSV file.');
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function classKey(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function expandClassKeys(name) {
  const k = classKey(name);
  const keys = new Set([k]);
  const stripped = k.replace(/^(class|grade|cls)\s+/, '');
  keys.add(stripped);
  const noOrdinal = stripped.replace(/(\d+)\s*(st|nd|rd|th)\b/g, '$1');
  keys.add(noOrdinal);
  if (noOrdinal) keys.add(`class ${noOrdinal}`);
  return [...keys].filter(Boolean);
}

function expandSectionKeys(name) {
  const k = classKey(name);
  const stripped = k.replace(/^(section|sec)\s+/, '');
  return [...new Set([k, stripped, stripped ? `section ${stripped}` : ''])].filter(Boolean);
}

async function buildClassIndex(sessionId) {
  const query = { status: 'active' };
  if (sessionId) query.sessionId = sessionId;
  const classes = await AcademyClass.find(query).select('className sessionId status disciplines');
  const byId = new Map(classes.map((c) => [String(c._id), c]));
  const byName = new Map();
  classes.forEach((c) => {
    expandClassKeys(c.className).forEach((key) => {
      if (key && !byName.has(key)) byName.set(key, c);
    });
  });
  return { byId, byName, classes };
}

async function buildSectionIndex(classIds) {
  const sections = await AcademySection.find({
    classId: { $in: classIds },
    status: 'active',
  }).select('sectionName classId');
  const byKey = new Map();
  sections.forEach((s) => {
    expandSectionKeys(s.sectionName).forEach((key) => {
      const mapKey = `${s.classId}:${key}`;
      if (!byKey.has(mapKey)) byKey.set(mapKey, s);
    });
  });
  return byKey;
}

function resolveClass(rec, defaultClass, index) {
  const labeled = cellToString(rec.className);
  const named = classKey(labeled);
  if (named) {
    for (const key of expandClassKeys(labeled)) {
      const found = index.byName.get(key);
      if (found) return found;
    }
    throw new Error(`CLASS "${labeled}" was not found in this session`);
  }
  if (defaultClass) return defaultClass;
  throw new Error('CLASS is required (or choose a default class before import)');
}

function resolveSection(rec, cls, sectionIndex) {
  const label = cellToString(rec.sectionName);
  if (!label) return { label: '', existing: null };
  for (const key of expandSectionKeys(label)) {
    const found = sectionIndex.get(`${cls._id}:${key}`);
    if (found) return { label, existing: found };
  }
  return { label, existing: null };
}

function rememberSection(sectionIndex, cls, section) {
  expandSectionKeys(section.sectionName).forEach((key) => {
    sectionIndex.set(`${cls._id}:${key}`, section);
  });
}

async function ensureSection(cls, rec, sectionIndex, userId) {
  const { label, existing } = resolveSection(rec, cls, sectionIndex);
  if (!label) return null;
  if (existing) return existing;
  try {
    const created = await sectionService.createSection(
      { classId: cls._id, sectionName: label, useClassSubjects: true },
      userId
    );
    rememberSection(sectionIndex, cls, created);
    return created;
  } catch (err) {
    if (err.statusCode === 409) {
      const dup = await AcademySection.findOne({ classId: cls._id, sectionName: label });
      if (dup) {
        rememberSection(sectionIndex, cls, dup);
        return dup;
      }
    }
    throw new Error(err.message || `Could not create section "${label}"`);
  }
}

function parseSubjectNames(value) {
  return cellToString(value)
    .split(/[,;|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllSubjectsValue(value) {
  const names = parseSubjectNames(value);
  if (!names.length) return true;
  if (names.length !== 1) return false;
  const token = names[0].toLowerCase().replace(/\s+/g, ' ');
  return token === 'all' || token === 'all subjects' || token === '*';
}

function isFullPackageValue(value) {
  const names = parseSubjectNames(value);
  if (names.length !== 1) return false;
  const token = names[0].toLowerCase().replace(/\s+/g, ' ');
  return token === 'full' || token === 'full package' || token === 'package';
}

async function resolveImportSubjects(cls, section, rec, cache) {
  const key = `${cls._id}:${section._id}`;
  if (!cache.has(key)) {
    cache.set(key, await getAllowedSubjects(cls._id, section._id, 'active'));
  }
  const allowed = cache.get(key);
  if (isAllSubjectsValue(rec.subjects)) {
    return { isFullPackage: false, selectedSubjects: allowed.map((s) => s._id) };
  }
  const names = parseSubjectNames(rec.subjects);
  const selected = [];
  const seen = new Set();
  const missing = [];
  for (const name of names) {
    const needle = name.toLowerCase().replace(/\s+/g, ' ');
    const hit = allowed.find(
      (s) =>
        String(s.subjectName || '').trim().toLowerCase() === needle ||
        String(s.subjectCode || '').trim().toLowerCase() === needle
    );
    if (!hit) {
      missing.push(name);
      continue;
    }
    const id = String(hit._id);
    if (seen.has(id)) continue;
    seen.add(id);
    selected.push(hit._id);
  }
  if (missing.length) {
    throw new Error(`Unknown subject(s) for this class/section: ${missing.join(', ')}`);
  }
  if (!selected.length) {
    throw new Error('Subjects cannot be empty — use all or comma-separated subject names');
  }
  return { isFullPackage: false, selectedSubjects: selected };
}

async function ensureDiscipline(cls, rawValue) {
  const name = cellToString(rawValue).replace(/\s+/g, ' ');
  if (!name) return '';
  const list = Array.isArray(cls.disciplines) ? cls.disciplines : [];
  const existing = list.find((d) => String(d).toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  cls.disciplines = [...list, name];
  await cls.save();
  return name;
}

async function importStudentsFromFile({ file, sessionId, classId, userId }) {
  if (!sessionId) throw new ApiError(400, 'Select an academic session first');
  const session = await Session.findById(sessionId).select('_id name');
  if (!session) throw new ApiError(400, 'Academic session not found');

  const records = await parseUpload(file);
  if (!records.length) {
    throw new ApiError(400, 'No student rows found. Use the template and keep the header row.');
  }
  if (records.length > MAX_ROWS) {
    throw new ApiError(400, `Too many rows (${records.length}). Import up to ${MAX_ROWS} students at a time.`);
  }

  const index = await buildClassIndex(sessionId);
  const sectionIndex = await buildSectionIndex(index.classes.map((c) => c._id));
  let defaultClass = null;
  if (classId) {
    defaultClass = index.byId.get(String(classId));
    if (!defaultClass) throw new ApiError(400, 'Default class is not an active class in this session');
  }

  const created = [];
  const failed = [];
  const seenRegs = new Set();
  const subjectCache = new Map();

  for (const rec of records) {
    try {
      const studentName = cellToString(rec.studentName);
      const fatherName = cellToString(rec.fatherName);
      if (!studentName) throw new Error('Student name is required');
      if (!fatherName) throw new Error('Father name is required');
      const phone = normalizePhone(rec.phone);
      if (!phone) throw new Error('Mobile must start with 03 or 3 (example 0300-1234567 or 3001234567)');
      let dateOfBirth;
      if (rec.dateOfBirth !== undefined && rec.dateOfBirth !== null && rec.dateOfBirth !== '') {
        dateOfBirth = parseDateOfBirth(rec.dateOfBirth);
        if (!dateOfBirth) throw new Error('Date of birth is invalid');
      }
      const cls = resolveClass(rec, defaultClass, index);
      const section = await ensureSection(cls, rec, sectionIndex, userId);
      const discipline = await ensureDiscipline(cls, rec.discipline);
      const registrationNumber = cellToString(rec.registrationNumber);
      if (registrationNumber) {
        const regKey = registrationNumber.toLowerCase();
        if (seenRegs.has(regKey)) throw new Error(`Duplicate Reg No ${registrationNumber} in this file`);
        seenRegs.add(regKey);
      }

      const already = await AcademyStudent.findOne({
        classId: cls._id,
        studentName: new RegExp(`^${escapeRegex(studentName)}$`, 'i'),
        fatherName: new RegExp(`^${escapeRegex(fatherName)}$`, 'i'),
      }).select('_id studentName');
      if (already) {
        throw new Error(`Already on record in this class (${already.studentName})`);
      }

      const description = cellToString(rec.description);

      if (!section) throw new Error('SECTION is required');
      const subjects = await resolveImportSubjects(cls, section, rec, subjectCache);

      const student = await studentService.registerImportedActiveStudent(
        {
          studentName,
          fatherName,
          phone,
          dateOfBirth,
          classId: String(cls._id),
          sectionId: String(section._id),
          registrationNumber: registrationNumber || undefined,
          discipline: discipline || undefined,
          description: description || undefined,
          isFullPackage: subjects.isFullPackage,
          selectedSubjects: subjects.selectedSubjects,
        },
        userId
      );
      created.push({
        row: rec._row,
        id: student._id,
        studentName: student.studentName,
        rollNumber: student.rollNumber,
      });
    } catch (err) {
      failed.push({ row: rec._row, error: err.message || 'Could not import this row' });
    }
  }

  return {
    sessionId: String(session._id),
    createdCount: created.length,
    failedCount: failed.length,
    created,
    failed,
  };
}

async function buildImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'The Concept Academy';
  workbook.created = new Date();
  workbook.company = 'The Concept Academy';

  const thin = { style: 'thin', color: { argb: 'FF000000' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const headerFont = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
  const dataFont = { name: 'Calibri', size: 11, color: { argb: 'FF000000' } };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const left = { horizontal: 'left', vertical: 'middle' };

  const headers = [
    'Sr#',
    'Reg No',
    'Student Name',
    'Father Name',
    'Mobile',
    'Admission Class',
    'CLASS',
    'SECTION',
    'Subjects',
  ];
  const widths = [6, 10, 30, 24, 16, 16, 10, 12, 36];
  const headerNotes = {
    1: 'Row number. You can leave this blank.',
    2: 'Optional. Kept if provided.',
    3: 'Required. Full student name.',
    4: 'Required. Father / guardian name.',
    5: 'Required. Type 03… — this column is text so the leading 0 is kept.',
    6: 'Stream: MED, ICS, ENGG, COMP, BIO. Blank is allowed.',
    7: 'Required. Must already exist in the session (9th, 10th, 11th, 12th).',
    8: 'Required. Created automatically if missing (A1, A2…).',
    9: 'Write all for every subject, or comma-separated names. Blank means all.',
  };

  const sheet = workbook.addWorksheet('Students', {
    views: [{ state: 'frozen', ySplit: 1, activeCell: 'C2', showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
  });
  sheet.properties.defaultRowHeight = 20;
  sheet.headerFooter.oddHeader = '&C&B STUDENT DETAIL';
  sheet.autoFilter = 'A1:I1';

  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
  sheet.getColumn(5).numFmt = '@';
  sheet.getColumn(9).numFmt = '@';

  const headerRow = sheet.getRow(1);
  headerRow.height = 29;
  headers.forEach((title, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = title;
    cell.font = headerFont;
    cell.border = border;
    cell.alignment = i === 2 || i === 3 || i === 8 ? left : center;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    cell.note = headerNotes[i + 1];
  });

  const blankRows = 200;
  for (let r = 2; r <= blankRows + 1; r += 1) {
    const row = sheet.getRow(r);
    row.height = 20;
    row.font = dataFont;
    for (let c = 1; c <= headers.length; c += 1) {
      const cell = row.getCell(c);
      cell.border = border;
      cell.font = dataFont;
      if (c === 1 || c === 2 || c === 5 || c === 6 || c === 7 || c === 8) {
        cell.alignment = center;
      } else {
        cell.alignment = left;
      }
    }
    row.getCell(1).value = { formula: `IF(C${r}="","",COUNTA($C$2:C${r}))` };
    row.getCell(5).numFmt = '@';
    row.getCell(9).numFmt = '@';
  }

  const applyList = (col, formula) => {
    for (let r = 2; r <= blankRows + 1; r += 1) {
      sheet.getRow(r).getCell(col).dataValidation = {
        type: 'list',
        allowBlank: true,
        showErrorMessage: false,
        showInputMessage: false,
        formulae: [formula],
      };
    }
  };
  applyList(6, '"MED,ICS,ENGG,COMP,BIO"');
  applyList(7, '"9th,10th,11th,12th"');
  applyList(8, '"A1,A2,A3,B1,B2"');

  return workbook.xlsx.writeBuffer();
}

module.exports = { importStudentsFromFile, buildImportTemplate, parseUpload };
