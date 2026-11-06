const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademyExpense = require('../../models/academy/AcademyExpense');
const AcademyStudent = require('../../models/academy/AcademyStudent');
const AcademyOpeningBalance = require('../../models/academy/AcademyOpeningBalance');
const Session = require('../../models/Session');
const { categoryNameMap } = require('./expenseCategoryService');
const { ACADEMY_BRAND } = require('../../config/academyBrand');
const ApiError = require('../../utils/ApiError');
const { resolveSessionStatus } = require('../session/sessionGuard');

/**
 * Balance sheet built on a CASH basis from PAID fee vouchers and paid academy expenses only.
 * Staff salaries and other modules are not included.
 *  - Fee income = paid vouchers, counted on their paid date (falls back to the billing month
 *    when the paid date is missing). Unpaid vouchers are not included anywhere.
 *  - Paid academy expenses are recognised on their expense date ("planned" ones are only disclosed).
 * Income, collected and receipts are therefore the same figure, and it matches the
 * Paid Fees report for the same date range. Assets (cash) = Fund always holds.
 */

const CASH_ACCOUNTS = {
  cash: 'Cash in hand',
  bank_transfer: 'Cash at bank',
  cheque: 'Cash at bank',
  online: 'Online / mobile wallet',
  other: 'Other cash accounts',
};
const CASH_ORDER = ['Cash in hand', 'Cash at bank', 'Online / mobile wallet', 'Other cash accounts'];

const FEE_INCOME_LABELS = {
  monthly: 'Tuition fees',
  admission: 'Admission fees',
  stationery: 'Stationery & materials',
};

function parseYmd(value, label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) throw new ApiError(400, `Invalid ${label} date. Use YYYY-MM-DD.`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) {
    throw new ApiError(400, `Invalid ${label} date.`);
  }
  return d;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const periodDate = (r) => new Date(r.year, r.month - 1, 1);
const cashAccount = (method) => CASH_ACCOUNTS[method] || CASH_ACCOUNTS.other;
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function addTo(map, key, amount) {
  map.set(key, (map.get(key) || 0) + amount);
}

const OPENING_KEY = 'default';

function ymdFromStored(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function loadSession(sessionId) {
  if (!sessionId || !/^[a-f0-9]{24}$/i.test(String(sessionId))) return null;
  const session = await Session.findById(sessionId)
    .select('name startDate endDate status isActive isClosed')
    .lean();
  if (!session?.startDate || !session?.endDate) return null;
  const from = ymdFromStored(session.startDate);
  const to = ymdFromStored(session.endDate);
  if (!from || !to) return null;
  return {
    id: String(session._id),
    name: session.name,
    from,
    to,
    status: resolveSessionStatus(session),
  };
}

async function getOpeningBalance(sessionId) {
  const session = await loadSession(sessionId);
  if (!session) return null;
  const row = await AcademyOpeningBalance.findOne({ key: session.id }).lean();
  if (!row) return null;
  return {
    amount: Number(row.amount) || 0,
    asOf: session.from,
    sessionId: session.id,
    sessionName: session.name,
  };
}

async function saveOpeningBalance({ amount, sessionId }, userId) {
  const session = await loadSession(sessionId);
  if (!session) throw new ApiError(400, 'Choose a session before saving the opening balance.');
  if (session.status !== 'active') {
    throw new ApiError(403, 'This session is closed. Its opening balance is read-only.');
  }
  const row = await AcademyOpeningBalance.findOneAndUpdate(
    { key: session.id },
    { key: session.id, amount: Number(amount) || 0, asOf: session.from, updatedBy: userId },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return {
    amount: Number(row.amount) || 0,
    asOf: session.from,
    sessionId: session.id,
    sessionName: session.name,
  };
}

/** Tuition and admission both payable at ₨ 0, or a 100% concession. Unset ₨ 0 fees do not count. */
function isFullFreeStudent(student) {
  if (Number(student.concessionPercent) >= 100) return true;
  const monthlyFee = Math.max(0, Number(student.monthlyFee) || 0);
  const admissionFee = Math.max(0, Number(student.admissionFee) || 0);
  if (monthlyFee <= 0 && admissionFee <= 0) return false;
  const monthlyDisc = Math.max(0, Number(student.monthlyFeeDiscount) || 0);
  const admissionDisc = Math.max(0, Number(student.admissionFeeDiscount) || 0);
  const legacyDisc = Math.max(0, Number(student.discountAmount) || 0);
  let admissionAmount;
  let monthlyAmount;
  if (monthlyDisc > 0 || admissionDisc > 0) {
    admissionAmount = Math.max(0, admissionFee - Math.min(admissionDisc, admissionFee));
    monthlyAmount = Math.max(0, monthlyFee - Math.min(monthlyDisc, monthlyFee));
  } else {
    let remaining = legacyDisc;
    const admCut = Math.min(remaining, admissionFee);
    remaining -= admCut;
    admissionAmount = Math.max(0, admissionFee - admCut);
    monthlyAmount = Math.max(0, monthlyFee - Math.min(remaining, monthlyFee));
  }
  return monthlyAmount <= 0 && admissionAmount <= 0;
}

async function getBalanceSheet({ from, to, sessionId } = {}) {
  const session = await loadSession(sessionId);
  const now = new Date();
  const fromDate = from
    ? parseYmd(from, 'start')
    : session
      ? parseYmd(session.from, 'start')
      : new Date(now.getFullYear(), 0, 1);
  const toDay = to
    ? parseYmd(to, 'end')
    : session
      ? parseYmd(session.to, 'end')
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (fromDate > toDay) throw new ApiError(400, 'Start date must be on or before the end date.');
  const toEnd = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);
  const toY = toDay.getFullYear();
  const toM = toDay.getMonth() + 1;

  const periodUpToTo = { $or: [{ year: { $lt: toY } }, { year: toY, month: { $lte: toM } }] };
  // Paid vouchers only: paid by the end date, or paid with no date and billed by then.
  const paidByTo = {
    status: 'paid',
    $or: [
      { paidAt: { $lte: toEnd } },
      { $and: [{ $or: [{ paidAt: null }, { paidAt: { $exists: false } }] }, periodUpToTo] },
    ],
  };

  const [fees, expenses, planned, waived, categoryNames, enrolledStudents, savedOpening] =
    await Promise.all([
    AcademyFeeRecord.find(paidByTo)
      .select('studentId amount status paidAt paymentMethod feeType month year')
      .lean(),
    AcademyExpense.find({ status: 'paid', expenseDate: { $lte: toEnd } })
      .select('amount expenseDate category categoryOther paymentMethod')
      .lean(),
    AcademyExpense.aggregate([
      { $match: { status: 'planned', expenseDate: { $gte: fromDate, $lte: toEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    AcademyFeeRecord.aggregate([
      { $match: { status: 'waived' } },
      { $addFields: { p: { $add: [{ $multiply: ['$year', 100] }, '$month'] } } },
      {
        $match: {
          p: {
            $gte: fromDate.getFullYear() * 100 + fromDate.getMonth() + 1,
            $lte: toY * 100 + toM,
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    categoryNameMap(),
    AcademyStudent.find({ status: { $in: ['active', 'pending_fee'] } })
      .select(
        'monthlyFee monthlyFeeDiscount admissionFee admissionFeeDiscount discountAmount concessionPercent'
      )
      .lean(),
    AcademyOpeningBalance.findOne({ key: session ? session.id : OPENING_KEY }).lean(),
  ]);

  const cash = new Map();
  const income = new Map();
  const expenditure = new Map();
  let openingFund = 0;
  let openingCash = 0;
  let receipts = 0;
  let expensePayments = 0;
  const paidStudentIds = new Set();
  // A session's opening always sits on the session's current start date, even if the
  // session dates were edited after the amount was saved.
  const openingDate = savedOpening ? (session ? session.from : savedOpening.asOf) : null;
  const savedAsOf = /^\d{4}-\d{2}-\d{2}$/.test(String(openingDate || '')) ? openingDate : null;
  const manualAsOf =
    savedAsOf && savedAsOf <= ymd(fromDate) ? parseYmd(savedAsOf, 'opening balance') : null;
  let skippedCash = 0;
  let paidCollected = 0;
  let waiverCollected = 0;
  const fullWaiverIds = new Set(
    enrolledStudents.filter(isFullFreeStudent).map((student) => String(student._id))
  );

  const trackCash = (when, amount, method) => {
    // Cash before the user opening date is already inside that balance.
    if (manualAsOf && when < manualAsOf) {
      skippedCash += amount;
      return false;
    }
    // amount > 0 is a receipt, < 0 a payment
    addTo(cash, cashAccount(method), amount);
    if (when < fromDate) openingCash += amount;
    return when >= fromDate;
  };

  // Cash basis: a paid voucher is income on the day it was paid.
  for (const f of fees) {
    const amount = Number(f.amount) || 0;
    const paidDate = f.paidAt ? new Date(f.paidAt) : periodDate(f);
    if (paidDate > toEnd) continue;

    if (paidDate < fromDate) openingFund += amount;
    else addTo(income, FEE_INCOME_LABELS[f.feeType] || 'Other fees', amount);

    const inBook = trackCash(paidDate, amount, f.paymentMethod);
    if (inBook) receipts += amount;
    if (amount > 0 && paidDate >= fromDate && f.studentId) {
      const sid = String(f.studentId);
      paidStudentIds.add(sid);
      paidCollected += amount;
      if (fullWaiverIds.has(sid)) waiverCollected += amount;
    }
  }

  for (const e of expenses) {
    const amount = Number(e.amount) || 0;
    const when = new Date(e.expenseDate);
    const label =
      e.category === 'other' && String(e.categoryOther || '').trim()
        ? String(e.categoryOther).trim()
        : categoryNames[e.category] || e.category || 'Other expenses';
    if (when < fromDate) openingFund -= amount;
    else addTo(expenditure, label, amount);
    if (trackCash(when, -amount, e.paymentMethod)) expensePayments += amount;
  }

  if (manualAsOf) {
    const savedAmount = Number(savedOpening.amount) || 0;
    openingCash += savedAmount;
    addTo(cash, CASH_ACCOUNTS.cash, savedAmount);
    openingFund += savedAmount - skippedCash;
  }

  const cashLines = CASH_ORDER.filter((k) => cash.has(k)).map((label) => ({
    label,
    amount: round(cash.get(label)),
  }));
  const totalCash = round(cashLines.reduce((n, l) => n + l.amount, 0));
  // Cash basis: unpaid vouchers are not receivables and early payments are not liabilities.
  const currentAssets = [
    { key: 'cash', label: 'Cash and cash equivalents', amount: totalCash, children: cashLines },
  ];
  const totalAssets = round(currentAssets.reduce((n, l) => n + l.amount, 0));

  const currentLiabilities = [];
  const totalLiabilities = 0;

  const incomeLines = [...income.entries()]
    .map(([label, amount]) => ({ label, amount: round(amount) }))
    // Full-waiver vouchers are paid at Rs 0 — no empty income lines.
    .filter((line) => line.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  const expenditureLines = [...expenditure.entries()]
    .map(([label, amount]) => ({ label, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const totalIncome = round(incomeLines.reduce((n, l) => n + l.amount, 0));
  const totalExpenditure = round(expenditureLines.reduce((n, l) => n + l.amount, 0));
  const surplus = round(totalIncome - totalExpenditure);
  const closingFund = round(openingFund + surplus);
  const totalLiabilitiesAndFund = round(totalLiabilities + closingFund);

  return {
    generatedAt: new Date().toISOString(),
    brand: {
      name: ACADEMY_BRAND.name,
      legalName: ACADEMY_BRAND.legalName,
      tagline: ACADEMY_BRAND.tagline,
      address: ACADEMY_BRAND.address,
      phones: ACADEMY_BRAND.phones,
      email: ACADEMY_BRAND.email,
    },
    range: { from: ymd(fromDate), to: ymd(toDay) },
    session: session ? { id: session.id, name: session.name, from: session.from, to: session.to } : null,
    assets: { current: currentAssets, total: totalAssets },
    liabilities: { current: currentLiabilities, total: totalLiabilities },
    fund: {
      opening: round(openingFund),
      surplus,
      closing: closingFund,
    },
    totalLiabilitiesAndFund,
    balanced: Math.abs(totalAssets - totalLiabilitiesAndFund) < 0.01,
    incomeStatement: {
      income: incomeLines,
      totalIncome,
      expenditure: expenditureLines,
      totalExpenditure,
      surplus,
    },
    cashFlow: {
      opening: round(openingCash),
      manualOpening: Boolean(manualAsOf),
      openingAsOf: manualAsOf ? savedAsOf : null,
      receipts: round(receipts),
      salaryPayments: 0,
      expensePayments: round(expensePayments),
      closing: totalCash,
    },
    headCounts: {
      paidStudents: paidStudentIds.size,
      paidCollected: round(paidCollected),
      fullWaiverStudents: fullWaiverIds.size,
      waiverCollected: round(waiverCollected),
    },
    notes: {
      plannedExpenses: { amount: round(planned[0]?.total || 0), count: planned[0]?.count || 0 },
      waivedFees: { amount: round(waived[0]?.total || 0), count: waived[0]?.count || 0 },
    },
  };
}

module.exports = { getBalanceSheet, getOpeningBalance, saveOpeningBalance };
