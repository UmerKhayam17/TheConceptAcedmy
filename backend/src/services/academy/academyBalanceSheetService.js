const AcademyFeeRecord = require('../../models/academy/AcademyFeeRecord');
const AcademyExpense = require('../../models/academy/AcademyExpense');
const { categoryNameMap } = require('./expenseCategoryService');
const { ACADEMY_BRAND } = require('../../config/academyBrand');
const ApiError = require('../../utils/ApiError');

/**
 * Balance sheet (statement of financial position) built from fee records and
 * academy expenses only. Staff salaries and other modules are not included.
 *  - Fee income is recognised in the fee's billing month; unpaid fees are receivables.
 *  - Paid academy expenses are recognised on their expense date ("planned" ones are only disclosed).
 *  - Cash moves on the paid date (falls back to the billing month when missing).
 * Because every figure comes from the same record set, Assets = Liabilities + Fund always holds.
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

async function getBalanceSheet({ from, to } = {}) {
  const now = new Date();
  const fromDate = from ? parseYmd(from, 'start') : new Date(now.getFullYear(), 0, 1);
  const toDay = to ? parseYmd(to, 'end') : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (fromDate > toDay) throw new ApiError(400, 'Start date must be on or before the end date.');
  const toEnd = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);
  const toY = toDay.getFullYear();
  const toM = toDay.getMonth() + 1;

  const periodUpToTo = { $or: [{ year: { $lt: toY } }, { year: toY, month: { $lte: toM } }] };
  const paidByTo = { status: 'paid', paidAt: { $lte: toEnd } };

  const [fees, expenses, planned, waived, categoryNames] = await Promise.all([
    AcademyFeeRecord.find({ status: { $ne: 'waived' }, $or: [periodUpToTo, paidByTo] })
      .select('amount status paidAt paymentMethod feeType month year dueDate')
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
  ]);

  const cash = new Map();
  const income = new Map();
  const expenditure = new Map();
  let openingFund = 0;
  let openingCash = 0;
  let receipts = 0;
  let expensePayments = 0;
  let receivableOverdue = 0;
  let receivableCurrent = 0;
  let feesInAdvance = 0;

  const trackCash = (when, amount, method) => {
    // amount > 0 is a receipt, < 0 a payment
    addTo(cash, cashAccount(method), amount);
    if (when < fromDate) openingCash += amount;
    return when >= fromDate;
  };

  for (const f of fees) {
    const amount = Number(f.amount) || 0;
    const pd = periodDate(f);
    const recognised = pd <= toEnd;
    const paidDate = f.status === 'paid' ? f.paidAt || pd : null;
    const paidByEnd = paidDate && paidDate <= toEnd;

    if (recognised) {
      if (pd < fromDate) openingFund += amount;
      else addTo(income, FEE_INCOME_LABELS[f.feeType] || 'Other fees', amount);
    }
    if (paidByEnd) {
      if (trackCash(paidDate, amount, f.paymentMethod)) receipts += amount;
      if (!recognised) feesInAdvance += amount;
    } else if (recognised) {
      const overdue = f.status === 'overdue' || (f.dueDate && new Date(f.dueDate) < toEnd);
      if (overdue) receivableOverdue += amount;
      else receivableCurrent += amount;
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

  const cashLines = CASH_ORDER.filter((k) => cash.has(k)).map((label) => ({
    label,
    amount: round(cash.get(label)),
  }));
  const totalCash = round(cashLines.reduce((n, l) => n + l.amount, 0));
  const totalReceivable = round(receivableOverdue + receivableCurrent);

  const currentAssets = [
    { key: 'cash', label: 'Cash and cash equivalents', amount: totalCash, children: cashLines },
    {
      key: 'receivable',
      label: 'Fees receivable',
      amount: totalReceivable,
      children: [
        { label: 'Not yet due', amount: round(receivableCurrent) },
        { label: 'Overdue', amount: round(receivableOverdue) },
      ],
    },
  ];
  const totalAssets = round(currentAssets.reduce((n, l) => n + l.amount, 0));

  const currentLiabilities = [
    { key: 'advanceFees', label: 'Fees received in advance', amount: round(feesInAdvance) },
  ];
  const totalLiabilities = round(currentLiabilities.reduce((n, l) => n + l.amount, 0));

  const incomeLines = [...income.entries()]
    .map(([label, amount]) => ({ label, amount: round(amount) }))
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
      receipts: round(receipts),
      salaryPayments: 0,
      expensePayments: round(expensePayments),
      closing: totalCash,
    },
    notes: {
      plannedExpenses: { amount: round(planned[0]?.total || 0), count: planned[0]?.count || 0 },
      waivedFees: { amount: round(waived[0]?.total || 0), count: waived[0]?.count || 0 },
    },
  };
}

module.exports = { getBalanceSheet };
