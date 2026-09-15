const ApiError = require('./ApiError');

function normalizeDisciplineList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const name = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function matchDiscipline(classDisciplines, value) {
  const names = normalizeDisciplineList(classDisciplines);
  const raw = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) {
    return { ok: true, value: '', required: false, names };
  }
  if (!names.length) {
    return { ok: true, value: raw, required: false, names };
  }
  const match = names.find((d) => d.toLowerCase() === raw.toLowerCase());
  if (!match) {
    return {
      ok: false,
      required: false,
      names,
      error: `Discipline must be one of: ${names.join(', ')}`,
    };
  }
  return { ok: true, value: match, required: false, names };
}

function assertDiscipline(classDoc, value) {
  const result = matchDiscipline(classDoc?.disciplines, value);
  if (!result.ok) throw new ApiError(400, result.error);
  return result.value;
}

module.exports = { normalizeDisciplineList, matchDiscipline, assertDiscipline };
