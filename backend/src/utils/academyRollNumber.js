const AcademyStudent = require('../models/academy/AcademyStudent');
const AcademyClass = require('../models/academy/AcademyClass');
const Session = require('../models/Session');
const { slugPart } = require('./rollNumber');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function classRollPrefix(classId) {
  const cls = await AcademyClass.findById(classId);
  if (!cls) throw new Error('Class not found');
  const session = cls.sessionId ? await Session.findById(cls.sessionId) : null;
  const sessionPart = slugPart(session?.name || 'SESSION');
  const classPart = slugPart(cls.className || 'CLASS');
  return `${sessionPart}-${classPart}`;
}

/**
 * Highest numeric suffix already used for this prefix (any student status),
 * then +1. Unique index applies to all non-empty rollNumbers — not only active.
 */
async function nextSeqForPrefix(prefix, { exactThreeDigits = false } = {}) {
  const pattern = exactThreeDigits
    ? `^${escapeRegex(prefix)}-(\\d{3})$`
    : `^${escapeRegex(prefix)}-(\\d+)$`;
  const rx = new RegExp(pattern);

  const rows = await AcademyStudent.find({
    rollNumber: new RegExp(`^${escapeRegex(prefix)}-`),
  })
    .select('rollNumber')
    .lean();

  let max = 0;
  for (const row of rows) {
    const m = String(row.rollNumber || '').match(rx);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

async function allocateRoll(prefix, { exactThreeDigits = false } = {}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seq = String(await nextSeqForPrefix(prefix, { exactThreeDigits })).padStart(3, '0');
    const candidate = `${prefix}-${seq}`;
    const taken = await AcademyStudent.exists({ rollNumber: candidate });
    if (!taken) return candidate;
  }
  throw new Error(`Unable to allocate roll number for prefix ${prefix}`);
}

/** Temporary roll assigned at admission intake (replaced on activation). */
async function generateTemporaryRollNumber(classId) {
  const prefix = `TMP-${await classRollPrefix(classId)}`;
  return allocateRoll(prefix);
}

/** Official class roll number — assigned when admission is completed. */
async function generateAcademyRollNumber(classId) {
  const prefix = await classRollPrefix(classId);
  return allocateRoll(prefix, { exactThreeDigits: true });
}

module.exports = { generateAcademyRollNumber, generateTemporaryRollNumber };
