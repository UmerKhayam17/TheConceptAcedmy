/**
 * Assessment taxonomy — single source of truth.
 *
 * Assessment = umbrella for anything that measures student learning.
 *   ├── Tests  (ongoing / formative)
 *   └── Exams  (formal / summative)
 */

const ASSESSMENT_CATEGORIES = {
  test: {
    key: 'test',
    label: 'Tests',
    description: 'Ongoing assessments used during the session (weekly, monthly, unit).',
  },
  exam: {
    key: 'exam',
    label: 'Exams',
    description: 'Formal papers and term examinations.',
  },
};

/** Canonical types under Assessment → Tests | Exams */
const ASSESSMENT_TYPES = {
  weekly: { key: 'weekly', label: 'Weekly Test', category: 'test' },
  monthly: { key: 'monthly', label: 'Monthly Test', category: 'test' },
  unit: { key: 'unit', label: 'Unit Test', category: 'test' },
  full_length: { key: 'full_length', label: 'Full Length Paper', category: 'exam' },
  full_book: { key: 'full_book', label: 'Full Book Paper', category: 'exam' },
  midterm: { key: 'midterm', label: 'Mid Term', category: 'exam' },
  final: { key: 'final', label: 'Final Exam', category: 'exam' },
};

/** Older stored values still accepted for existing records. */
const LEGACY_ASSESSMENT_TYPES = {
  quiz: { key: 'quiz', label: 'Quiz', category: 'test' },
  assignment: { key: 'assignment', label: 'Assignment', category: 'test' },
  practice: { key: 'practice', label: 'Practice Test', category: 'test' },
  other: { key: 'other', label: 'Other', category: 'test' },
};

const ALL_TYPE_DEFS = { ...ASSESSMENT_TYPES, ...LEGACY_ASSESSMENT_TYPES };

const ASSESSMENT_TYPE_KEYS = Object.keys(ASSESSMENT_TYPES);
const ALL_ASSESSMENT_TYPE_KEYS = Object.keys(ALL_TYPE_DEFS);

const TEST_TYPE_KEYS = ASSESSMENT_TYPE_KEYS.filter((k) => ASSESSMENT_TYPES[k].category === 'test');
const EXAM_TYPE_KEYS = ASSESSMENT_TYPE_KEYS.filter((k) => ASSESSMENT_TYPES[k].category === 'exam');

/** Display labels used by the Exam (term) module `type` field. */
const EXAM_TYPE_LABELS = EXAM_TYPE_KEYS.map((k) => ASSESSMENT_TYPES[k].label);

const LEGACY_EXAM_TYPE_LABELS = ['Final Term', 'Monthly', 'Board Mock', 'Other'];

function assessmentTypeLabel(type) {
  if (!type) return '';
  return ALL_TYPE_DEFS[type]?.label || String(type);
}

function assessmentCategoryOf(type) {
  return ALL_TYPE_DEFS[type]?.category || null;
}

function isTestType(type) {
  return assessmentCategoryOf(type) === 'test';
}

function isExamType(type) {
  return assessmentCategoryOf(type) === 'exam';
}

/** Default test slots created when a session assessment plan is initialized. */
const TEST_NAME_TEMPLATES = Array.from({ length: 15 }, (_, i) => ({
  name: `TEST NO.${i + 1}`,
  assessmentType: i === 0 ? 'weekly' : i === 1 ? 'monthly' : 'weekly',
  category: 'test',
}));

/** Default exam slots created when a session assessment plan is initialized. */
const EXAM_NAME_TEMPLATES = [
  { name: 'FULL LENGTH PAPER-I', assessmentType: 'full_length', category: 'exam' },
  { name: 'FULL LENGTH PAPER-II', assessmentType: 'full_length', category: 'exam' },
  { name: 'FULL LENGTH PAPER-III', assessmentType: 'full_length', category: 'exam' },
  { name: 'FULL BOOK PAPER', assessmentType: 'full_book', category: 'exam' },
];

module.exports = {
  ASSESSMENT_CATEGORIES,
  ASSESSMENT_TYPES,
  LEGACY_ASSESSMENT_TYPES,
  ALL_TYPE_DEFS,
  ASSESSMENT_TYPE_KEYS,
  ALL_ASSESSMENT_TYPE_KEYS,
  TEST_TYPE_KEYS,
  EXAM_TYPE_KEYS,
  EXAM_TYPE_LABELS,
  LEGACY_EXAM_TYPE_LABELS,
  TEST_NAME_TEMPLATES,
  EXAM_NAME_TEMPLATES,
  assessmentTypeLabel,
  assessmentCategoryOf,
  isTestType,
  isExamType,
};
