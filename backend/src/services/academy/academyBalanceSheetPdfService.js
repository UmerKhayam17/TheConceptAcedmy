const PDFDocument = require('pdfkit');
const { getBalanceSheet } = require('./academyBalanceSheetService');
const {
  drawPdfLetterheadPlain,
  drawPdfTitlePlain,
  drawPdfFooterTextPlain,
  pdfLine,
  fitText,
  ACADEMY_BRAND,
  resolveLogoPath,
} = require('./academyReportDocument');

const GRAY = '#C8C8C8';
const LINE = '#000000';
const MARGIN = 28;
const GAP = 8;
const ROW_H = 15;
const HEADER_H = 16;
const FOOTER_RESERVE = 36;
const AMOUNT_W = 78;

function money(n) {
  const value = Number(n) || 0;
  if (Math.abs(value) < 0.005) return '–';
  const formatted = Math.abs(value).toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return value < 0 ? `(${formatted})` : formatted;
}

function shortDate(value) {
  const [y, m, d] = String(value || '').split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function linesToRows(lines, emptyLabel) {
  if (!lines?.length) return [{ label: emptyLabel, amount: 0, kind: 'item' }];
  const rows = [];
  lines.forEach((line) => {
    if (line.children?.length) {
      rows.push({ label: line.label, kind: 'group' });
      line.children.forEach((child) => {
        rows.push({ label: child.label, amount: child.amount, kind: 'sub' });
      });
      rows.push({
        label: `Total ${String(line.label).toLowerCase()}`,
        amount: line.amount,
        kind: 'subtotal',
      });
    } else {
      rows.push({ label: line.label, amount: line.amount, kind: 'item' });
    }
  });
  return rows;
}

/** Keep the closing totals on the same row by padding the shorter column. */
function alignClosingTotals(leftRows, rightRows) {
  const leftBody = leftRows.slice(0, -1);
  const rightBody = rightRows.slice(0, -1);
  const count = Math.max(leftBody.length, rightBody.length);
  while (leftBody.length < count) leftBody.push({ kind: 'blank' });
  while (rightBody.length < count) rightBody.push({ kind: 'blank' });
  return [leftBody.concat(leftRows[leftRows.length - 1]), rightBody.concat(rightRows[rightRows.length - 1])];
}

function renderBalanceSheetPdf(sheet) {
  const brand = ACADEMY_BRAND;
  const logoPath = resolveLogoPath();
  const reportMeta = {
    generatedAt: sheet.generatedAt || new Date(),
    leftFilter: `From: ${shortDate(sheet.range.from)}`,
    centerFilter: `As at ${shortDate(sheet.range.to)}`,
    rightFilter: 'PKR',
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: `Balance Sheet — ${brand.name}`,
          Author: brand.name,
          Subject: `Statement of financial position as at ${sheet.range.to}`,
          Creator: brand.legalName,
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const contentW = doc.page.width - MARGIN * 2;
      const tableW = (contentW - GAP) / 2;
      const pageBottom = () => doc.page.height - FOOTER_RESERVE;

      const startBodyY = () => {
        let y = drawPdfLetterheadPlain(doc, brand, logoPath);
        y = drawPdfTitlePlain(
          doc,
          {
            title: 'Balance Sheet',
            leftFilter: reportMeta.leftFilter,
            centerFilter: reportMeta.centerFilter,
            rightFilter: reportMeta.rightFilter,
            extraLine: 'Statement of Financial Position',
          },
          y
        );
        return y + 4;
      };

      const paintCell = (x, y, width, row, { header = false, continued = false } = {}) => {
        const fill = header
          ? GRAY
          : row.kind === 'grand' || row.kind === 'total'
            ? '#E8E8E8'
            : row.kind === 'group' || row.kind === 'subtotal'
              ? '#F4F4F4'
              : null;
        if (fill) {
          doc.save();
          doc.rect(x, y, width, header ? HEADER_H : ROW_H).fill(fill);
          doc.restore();
        }
        const rowH = header ? HEADER_H : ROW_H;
        doc.rect(x, y, width, rowH).strokeColor(LINE).lineWidth(header || row.kind === 'grand' ? 0.8 : 0.45).stroke();
        const amountX = x + width - AMOUNT_W;
        doc
          .moveTo(amountX, y)
          .lineTo(amountX, y + rowH)
          .strokeColor(LINE)
          .lineWidth(0.45)
          .stroke();

        if (header) {
          const title = continued ? `${row} (cont.)` : row;
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
          pdfLine(doc, fitText(doc, title, width - AMOUNT_W - 8), x + 4, y + 4, {
            width: width - AMOUNT_W - 8,
          });
          pdfLine(doc, 'PKR', amountX, y + 4, { width: AMOUNT_W - 4, align: 'center' });
          return;
        }

        if (row.kind === 'blank') return;

        const bold = row.kind === 'group' || row.kind === 'subtotal' || row.kind === 'total' || row.kind === 'grand';
        const indent = row.kind === 'sub' ? 14 : row.kind === 'item' || row.kind === 'subtotal' ? 8 : 4;
        const labelWidth = width - AMOUNT_W - indent - 6;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor('#000');
        pdfLine(doc, fitText(doc, row.label, labelWidth), x + indent, y + 4, { width: labelWidth });
        if (row.amount !== undefined && row.amount !== null) {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor('#000');
          pdfLine(doc, money(row.amount), amountX + 3, y + 4, { width: AMOUNT_W - 8, align: 'right' });
        }
      };

      const drawTable = (x, y, rows, title, continued) => {
        paintCell(x, y, tableW, title, { header: true, continued });
        rows.forEach((row, index) => {
          paintCell(x, y + HEADER_H + index * ROW_H, tableW, row);
        });
      };

      const drawPair = (y, leftTitle, rightTitle, leftRows, rightRows) => {
        const [left, right] = alignClosingTotals(leftRows, rightRows);
        let index = 0;
        let continued = false;
        while (index < left.length) {
          if (y + HEADER_H + ROW_H > pageBottom()) {
            doc.addPage();
            y = startBodyY();
          }
          const capacity = Math.max(1, Math.floor((pageBottom() - y - HEADER_H) / ROW_H));
          const take = Math.min(capacity, left.length - index);
          drawTable(MARGIN, y, left.slice(index, index + take), leftTitle, continued);
          drawTable(MARGIN + tableW + GAP, y, right.slice(index, index + take), rightTitle, continued);
          y += HEADER_H + take * ROW_H;
          index += take;
          continued = true;
          if (index < left.length) {
            doc.addPage();
            y = startBodyY();
          }
        }
        return y;
      };

      const drawFullRow = (y, label, amount) => {
        if (y + ROW_H > pageBottom()) {
          doc.addPage();
          y = startBodyY();
        }
        doc.save();
        doc.rect(MARGIN, y, contentW, ROW_H).fill('#E8E8E8');
        doc.restore();
        doc.rect(MARGIN, y, contentW, ROW_H).strokeColor(LINE).lineWidth(0.8).stroke();
        const amountX = MARGIN + contentW - AMOUNT_W;
        doc.moveTo(amountX, y).lineTo(amountX, y + ROW_H).strokeColor(LINE).lineWidth(0.45).stroke();
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
        pdfLine(doc, label, MARGIN + 4, y + 4, { width: contentW - AMOUNT_W - 10 });
        pdfLine(doc, money(amount), amountX + 3, y + 4, { width: AMOUNT_W - 8, align: 'right' });
        return y + ROW_H;
      };

      const drawSingleTable = (y, title, rows) => {
        const height = HEADER_H + rows.length * ROW_H;
        if (y + height > pageBottom()) {
          doc.addPage();
          y = startBodyY();
        }
        doc.save();
        doc.rect(MARGIN, y, contentW, HEADER_H).fill(GRAY);
        doc.restore();
        doc.rect(MARGIN, y, contentW, HEADER_H).strokeColor(LINE).lineWidth(0.8).stroke();
        const amountX = MARGIN + contentW - AMOUNT_W;
        doc.moveTo(amountX, y).lineTo(amountX, y + HEADER_H).strokeColor(LINE).lineWidth(0.45).stroke();
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000');
        pdfLine(doc, title, MARGIN + 4, y + 4, { width: contentW - AMOUNT_W - 10 });
        pdfLine(doc, 'PKR', amountX, y + 4, { width: AMOUNT_W - 4, align: 'center' });
        rows.forEach((row, index) => {
          const rowY = y + HEADER_H + index * ROW_H;
          if (row.kind === 'grand') {
            doc.save();
            doc.rect(MARGIN, rowY, contentW, ROW_H).fill('#E8E8E8');
            doc.restore();
          }
          doc
            .rect(MARGIN, rowY, contentW, ROW_H)
            .strokeColor(LINE)
            .lineWidth(row.kind === 'grand' ? 0.8 : 0.45)
            .stroke();
          doc.moveTo(amountX, rowY).lineTo(amountX, rowY + ROW_H).strokeColor(LINE).lineWidth(0.45).stroke();
          const bold = row.kind === 'grand';
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor('#000');
          pdfLine(doc, row.label, MARGIN + 4, rowY + 4, { width: contentW - AMOUNT_W - 10 });
          pdfLine(doc, money(row.amount), amountX + 3, rowY + 4, { width: AMOUNT_W - 8, align: 'right' });
        });
        return y + height;
      };

      let y = startBodyY();

      const assets = [
        { label: 'Current assets', kind: 'group' },
        ...linesToRows(sheet.assets.current, 'No assets recorded'),
        { label: 'Total assets', amount: sheet.assets.total, kind: 'grand' },
      ];
      const liabilities = [
        { label: 'Current liabilities', kind: 'group' },
        ...linesToRows(sheet.liabilities.current, 'No liabilities recorded'),
        { label: 'Total liabilities', amount: sheet.liabilities.total, kind: 'total' },
        { label: 'Accumulated fund', kind: 'group' },
        {
          label: `Opening ${shortDate(sheet.range.from)}`,
          amount: sheet.fund.opening,
          kind: 'item',
        },
        {
          label: `${sheet.fund.surplus >= 0 ? 'Surplus' : 'Deficit'} for the period`,
          amount: sheet.fund.surplus,
          kind: 'item',
        },
        { label: 'Closing fund', amount: sheet.fund.closing, kind: 'total' },
        { label: 'Total liabilities & fund', amount: sheet.totalLiabilitiesAndFund, kind: 'grand' },
      ];
      y = drawPair(y, 'Assets', 'Liabilities & Fund', assets, liabilities);

      y += 6;
      const balanceText = sheet.balanced
        ? 'Balanced — total assets equal total liabilities and accumulated fund.'
        : 'Not balanced — please review the underlying records.';
      if (y + 12 > pageBottom()) {
        doc.addPage();
        y = startBodyY();
      }
      doc.font('Helvetica').fontSize(7).fillColor('#333');
      pdfLine(doc, balanceText, MARGIN, y, { width: contentW });
      y += 14;

      const income = [
        ...linesToRows(sheet.incomeStatement.income, 'No income recorded'),
        { label: 'Total income', amount: sheet.incomeStatement.totalIncome, kind: 'grand' },
      ];
      const expenditure = [
        ...linesToRows(sheet.incomeStatement.expenditure, 'No expenditure recorded'),
        { label: 'Total expenditure', amount: sheet.incomeStatement.totalExpenditure, kind: 'grand' },
      ];
      y = drawPair(y, 'Income', 'Expenditure', income, expenditure);
      y = drawFullRow(
        y,
        `Net ${sheet.incomeStatement.surplus >= 0 ? 'surplus' : 'deficit'} for the period`,
        sheet.incomeStatement.surplus
      );

      y += 10;
      y = drawSingleTable(y, 'Cash summary', [
        { label: `Opening balance (${shortDate(sheet.range.from)})`, amount: sheet.cashFlow.opening, kind: 'item' },
        { label: 'Add: fees received', amount: sheet.cashFlow.receipts, kind: 'item' },
        { label: 'Less: salaries paid', amount: -sheet.cashFlow.salaryPayments, kind: 'item' },
        { label: 'Less: expenses paid', amount: -sheet.cashFlow.expensePayments, kind: 'item' },
        { label: `Closing balance (${shortDate(sheet.range.to)})`, amount: sheet.cashFlow.closing, kind: 'grand' },
      ]);

      const notes = [
        'Prepared on an accrual basis from fee, payroll and expense records.',
        'Unpaid fees are shown as receivables. Unpaid salaries are shown as payables.',
        `Fee waivers in the period: ${sheet.notes.waivedFees.count} record(s), PKR ${money(sheet.notes.waivedFees.amount)}. Excluded from income.`,
        `Planned expenses not yet incurred: ${sheet.notes.plannedExpenses.count} record(s), PKR ${money(sheet.notes.plannedExpenses.amount)}. Not recognised.`,
        'Fixed assets, long-term liabilities and bank reconciliations are not included.',
      ];

      y += 12;
      doc.font('Helvetica').fontSize(7);
      const notesHeight = notes.reduce(
        (sum, note) => sum + doc.heightOfString(note, { width: contentW - 12 }) + 2,
        28
      );
      if (y + notesHeight + 40 > pageBottom()) {
        doc.addPage();
        y = startBodyY();
      }
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
      pdfLine(doc, 'Basis of preparation', MARGIN, y);
      y += 12;
      notes.forEach((note, index) => {
        const text = `${index + 1}.  ${note}`;
        doc.font('Helvetica').fontSize(7).fillColor('#222');
        const height = doc.heightOfString(text, { width: contentW });
        doc.text(text, MARGIN, y, { width: contentW });
        y += height + 2;
      });

      y += 26;
      if (y + 28 > pageBottom()) {
        doc.addPage();
        y = startBodyY() + 20;
      }
      const colW = contentW / 3;
      [
        ['Prepared by', 'Accountant'],
        ['Reviewed by', 'Finance Officer'],
        ['Approved by', 'Principal / Director'],
      ].forEach(([label, role], index) => {
        const x = MARGIN + index * colW;
        doc.strokeColor(LINE).lineWidth(0.6);
        doc.moveTo(x + 8, y).lineTo(x + colW - 16, y).stroke();
        doc.fillColor('#000').font('Helvetica').fontSize(7.5);
        pdfLine(doc, label, x, y + 4, { width: colW - 8, align: 'center' });
        doc.fillColor('#444').fontSize(6.5);
        pdfLine(doc, role, x, y + 14, { width: colW - 8, align: 'center' });
      });

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterTextPlain(doc, brand, 'Balance Sheet', reportMeta, i + 1, range.count);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function getBalanceSheetPdf({ from, to } = {}) {
  const sheet = await getBalanceSheet({ from, to });
  const buffer = await renderBalanceSheetPdf(sheet);
  return { buffer, range: sheet.range };
}

module.exports = { getBalanceSheetPdf };
