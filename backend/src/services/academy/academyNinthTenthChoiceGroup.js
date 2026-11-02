const AcademyClass = require('../../models/academy/AcademyClass');
const AcademySubject = require('../../models/academy/AcademySubject');
const {
  NINTH_TENTH_CHOICE_GROUP,
  isNinthOrTenthClass,
  matchChoiceSubject,
} = require('../../config/academyDefaultSubjects');

/**
 * Mark Biology + Computer Science on a 9th/10th class as the elective choice group.
 * Creates missing subjects when neither exists yet.
 */
async function ensureNinthTenthChoiceGroupForClass(cls, { createMissing = false } = {}) {
  if (!cls?._id || !isNinthOrTenthClass(cls.className)) {
    return { classId: cls?._id, className: cls?.className, skipped: true, reason: 'not-9th-10th' };
  }

  const group = NINTH_TENTH_CHOICE_GROUP;
  const subjects = await AcademySubject.find({ classId: cls._id }).lean();
  const updates = [];
  const missing = [];

  for (const def of group.subjects) {
    const hit = subjects.find((s) => matchChoiceSubject(s, def.subjectName));
    if (!hit) {
      missing.push(def.subjectName);
      continue;
    }
    const needsUpdate =
      hit.enrollmentType !== 'choice' ||
      String(hit.choiceGroupName || '').trim() !== group.groupName ||
      Number(hit.pickCount) !== group.pickCount ||
      hit.status !== 'active';
    if (!needsUpdate) continue;
    await AcademySubject.updateOne(
      { _id: hit._id },
      {
        $set: {
          enrollmentType: 'choice',
          choiceGroupName: group.groupName,
          pickCount: group.pickCount,
          status: 'active',
        },
      }
    );
    updates.push(hit.subjectName);
  }

  let created = [];
  if (createMissing && missing.length) {
    const { defaultSalaryWeights } = require('../../utils/subjectSalaryWeights');
    const { generateSubjectCode } = require('../../config/academyDefaultSubjects');
    const codeSet = new Set(subjects.map((s) => String(s.subjectCode || '').trim().toUpperCase()));
    for (const name of missing) {
      let subjectCode = generateSubjectCode(name, cls.className);
      if (codeSet.has(subjectCode)) {
        let n = 2;
        let alt = `${subjectCode}-${n}`;
        while (codeSet.has(alt) && n < 50) {
          n += 1;
          alt = `${subjectCode}-${n}`;
        }
        subjectCode = alt;
      }
      const weights = defaultSalaryWeights(cls.className, name, subjectCode);
      const doc = await AcademySubject.create({
        subjectName: name,
        subjectCode,
        classId: cls._id,
        status: 'active',
        enrollmentType: 'choice',
        choiceGroupName: group.groupName,
        pickCount: group.pickCount,
        tuitionSharePercent: weights.tuitionSharePercent,
      });
      codeSet.add(subjectCode);
      created.push(doc.subjectName);
    }
  }

  return {
    classId: String(cls._id),
    className: cls.className,
    groupName: group.groupName,
    pickCount: group.pickCount,
    updated: updates,
    created,
    missing: createMissing ? [] : missing,
  };
}

/**
 * Apply Biology / Computer choice group on every active 9th and 10th class.
 */
async function ensureNinthTenthChoiceGroups({ createMissing = true } = {}) {
  const classes = await AcademyClass.find({ status: 'active' }).select('className status').lean();
  const targets = classes.filter((c) => isNinthOrTenthClass(c.className));
  const results = [];
  for (const cls of targets) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await ensureNinthTenthChoiceGroupForClass(cls, { createMissing }));
  }
  return {
    scannedClasses: classes.length,
    ninthTenthClasses: targets.length,
    results,
  };
}

module.exports = {
  ensureNinthTenthChoiceGroupForClass,
  ensureNinthTenthChoiceGroups,
};
