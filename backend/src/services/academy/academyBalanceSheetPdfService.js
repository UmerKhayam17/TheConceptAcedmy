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

const NAVY = '#0E2A4E';
const GOLD = '#E8A317';
const GRAY = '#E8EEF5';
const LINE = '#1A2A3A';
const MUTED = '#5A6A7A';
const MARGIN = 30;
const GAP = 10;
const ROW_H = 15;
const HEADER_H = 17;
const FOOTER_RESERVE = 36;
const AMOUNT_W = 82;

function money(n) {
  const value = Number(n) || 0;
  if (Math.abs(value) < 0.005) return '–';
  const formatted = Math.abs(value).toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return value < 0 ? `-${formatted}` : formatted;
}

function shortDate(value) {
  const [y, m, d] = String(value || '').split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function linesToRows(lines, emptyLabel) {
  if (!lines?.length) return [{ label: emptyLabel, amount: 0, kind: 'item' }];
  return lines.map((line) => ({ label: line.label, amount: line.amount, kind: 'item' }));
}

/** Keep closing totals on the same row by padding the shorter column. */
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
    leftFilter: sheet.session?.name || `From: ${shortDate(sheet.range.from)}`,
    centerFilter: sheet.session ? `From: ${shortDate(sheet.range.from)}` : `To: ${shortDate(sheet.range.to)}`,
    rightFilter: sheet.session ? `To: ${shortDate(sheet.range.to)}` : 'All figures in PKR',
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'portrait',
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: `Income & Expenditure — ${brand.name}`,
          Author: brand.name,
          Subject: `Income and expenditure for ${sheet.range.from} to ${sheet.range.to}`,
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
            title: 'Income & Expenditure',
            leftFilter: reportMeta.leftFilter,
            centerFilter: reportMeta.centerFilter,
            rightFilter: reportMeta.rightFilter,
          },
          y
        );
        return y + 8;
      };

      const paintCell = (x, y, width, row, { header = false, continued = false } = {}) => {
        const fill = header
          ? NAVY
          : row.kind === 'grand' || row.kind === 'total'
            ? GRAY
            : null;
        if (fill) {
          doc.save();
          doc.rect(x, y, width, header ? HEADER_H : ROW_H).fill(fill);
          doc.restore();
        }
        const rowH = header ? HEADER_H : ROW_H;
        doc
          .rect(x, y, width, rowH)
          .strokeColor(LINE)
          .lineWidth(header || row.kind === 'grand' ? 0.85 : 0.4)
          .stroke();
        const amountX = x + width - AMOUNT_W;
        doc
          .moveTo(amountX, y)
          .lineTo(amountX, y + rowH)
          .strokeColor(LINE)
          .lineWidth(0.4)
          .stroke();

        if (header) {
          const title = continued ? `${row} (cont.)` : row;
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
          pdfLine(doc, fitText(doc, title, width - AMOUNT_W - 8), x + 4, y + 4.5, {
            width: width - AMOUNT_W - 8,
          });
          pdfLine(doc, 'PKR', amountX, y + 4.5, { width: AMOUNT_W - 4, align: 'center' });
          return;
        }

        if (row.kind === 'blank') return;

        const bold = row.kind === 'grand' || row.kind === 'total';
        const indent = 6;
        const labelWidth = width - AMOUNT_W - indent - 6;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#111111');
        pdfLine(doc, fitText(doc, row.label, labelWidth), x + indent, y + 4, { width: labelWidth });
        if (row.amount !== undefined && row.amount !== null) {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#111111');
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

      const drawSingleTable = (y, title, rows) => {
        const height = HEADER_H + rows.length * ROW_H;
        if (y + height > pageBottom()) {
          doc.addPage();
          y = startBodyY();
        }
        const showCount = Boolean(rows.showCount);
        const countW = showCount ? 52 : 0;
        doc.save();
        doc.rect(MARGIN, y, contentW, HEADER_H).fill(NAVY);
        doc.restore();
        doc.rect(MARGIN, y, contentW, HEADER_H).strokeColor(LINE).lineWidth(0.85).stroke();
        const amountX = MARGIN + contentW - AMOUNT_W;
        const countX = amountX - countW;
        doc.moveTo(amountX, y).lineTo(amountX, y + HEADER_H).strokeColor(LINE).lineWidth(0.4).stroke();
        if (showCount) {
          doc.moveTo(countX, y).lineTo(countX, y + HEADER_H).strokeColor(LINE).lineWidth(0.4).stroke();
        }
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
        pdfLine(doc, title, MARGIN + 4, y + 4.5, { width: contentW - AMOUNT_W - countW - 10 });
        if (showCount) {
          pdfLine(doc, 'No.', countX, y + 4.5, { width: countW - 4, align: 'center' });
        }
        pdfLine(doc, rows.amountHeader || 'PKR', amountX, y + 4.5, { width: AMOUNT_W - 4, align: 'center' });
        rows.forEach((row, index) => {
          const rowY = y + HEADER_H + index * ROW_H;
          if (row.kind === 'grand') {
            doc.save();
            doc.rect(MARGIN, rowY, contentW, ROW_H).fill(GRAY);
            doc.restore();
          }
          doc
            .rect(MARGIN, rowY, contentW, ROW_H)
            .strokeColor(LINE)
            .lineWidth(row.kind === 'grand' ? 0.85 : 0.4)
            .stroke();
          doc.moveTo(amountX, rowY).lineTo(amountX, rowY + ROW_H).strokeColor(LINE).lineWidth(0.4).stroke();
          if (showCount) {
            doc.moveTo(countX, rowY).lineTo(countX, rowY + ROW_H).strokeColor(LINE).lineWidth(0.4).stroke();
          }
          const bold = row.kind === 'grand';
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#111111');
          pdfLine(doc, row.label, MARGIN + 6, rowY + 4, {
            width: contentW - AMOUNT_W - countW - 14,
          });
          if (showCount) {
            pdfLine(doc, String(row.count || 0), countX + 3, rowY + 4, {
              width: countW - 8,
              align: 'right',
            });
          }
          pdfLine(doc, row.display != null ? String(row.display) : money(row.amount), amountX + 3, rowY + 4, {
            width: AMOUNT_W - 8,
            align: 'right',
          });
        });
        return y + height;
      };

      const drawFullRow = (y, label, amount) => {
        if (y + ROW_H > pageBottom()) {
          doc.addPage();
          y = startBodyY();
        }
        doc.rect(MARGIN, y, contentW, ROW_H).strokeColor(LINE).lineWidth(0.4).stroke();
        const amountX = MARGIN + contentW - AMOUNT_W;
        doc.moveTo(amountX, y).lineTo(amountX, y + ROW_H).strokeColor(LINE).lineWidth(0.4).stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111');
        pdfLine(doc, label, MARGIN + 4, y + 4, { width: contentW - AMOUNT_W - 10 });
        pdfLine(doc, money(amount), amountX + 3, y + 4, { width: AMOUNT_W - 8, align: 'right' });
        return y + ROW_H;
      };

      let y = startBodyY();

      const openingAsOf = sheet.cashFlow.openingAsOf || sheet.range.from;
      y = drawFullRow(y, `Opening balance (${shortDate(openingAsOf)})`, sheet.cashFlow.opening);
      y += 8;

      // Left = Income · Right = Expenditure
      const income = [
        ...linesToRows(sheet.incomeStatement.income, 'No income recorded'),
        { label: 'Total income', amount: sheet.incomeStatement.totalIncome, kind: 'grand' },
      ];
      const expenditure = [
        ...linesToRows(sheet.incomeStatement.expenditure, 'No expenditure recorded'),
        { label: 'Total expenditure', amount: sheet.incomeStatement.totalExpenditure, kind: 'grand' },
      ];
      y = drawPair(y, 'Income', 'Expenditure', income, expenditure);

      // Cash calculation sits directly under income and expenditure.
      y += 10;
      if (y + 20 > pageBottom()) {
        doc.addPage();
        y = startBodyY();
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9);
      pdfLine(doc, 'Cash on Hand', MARGIN, y);
      doc.save();
      doc.rect(MARGIN, y + 12, contentW, 1.5).fill(GOLD);
      doc.restore();
      y += 18;

      y = drawSingleTable(y, 'Cash on Hand', [
        {
          label: sheet.cashFlow.manualOpening
            ? `Opening balance (${shortDate(sheet.range.from)})`
            : `Opening cash (${shortDate(sheet.range.from)})`,
          amount: sheet.cashFlow.opening,
          kind: 'item',
        },
        { label: 'Add: fees / receipts collected', amount: sheet.cashFlow.receipts, kind: 'item' },
        { label: 'Less: academy expenses paid', amount: -sheet.cashFlow.expensePayments, kind: 'item' },
        {
          label: `Cash on hand as at ${shortDate(sheet.range.to)}`,
          amount: sheet.cashFlow.closing,
          kind: 'grand',
        },
      ]);

      const heads = sheet.headCounts || {};
      y += 14;
      if (y + 20 > pageBottom()) {
        doc.addPage();
        y = startBodyY();
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9);
      pdfLine(doc, 'Students', MARGIN, y);
      doc.save();
      doc.rect(MARGIN, y + 12, contentW, 1.5).fill(GOLD);
      doc.restore();
      y += 18;
      const studentRows = [
        {
          label: 'Students who paid fees',
          count: heads.paidStudents || 0,
          amount: heads.paidCollected || 0,
          kind: 'item',
        },
        {
          label: 'Students on 100% free / full waiver',
          count: heads.fullWaiverStudents || 0,
          amount: heads.waiverCollected || 0,
          kind: 'item',
        },
      ];
      studentRows.showCount = true;
      studentRows.amountHeader = 'Collected';
      y = drawSingleTable(y, 'Students', studentRows);

      // Signature block pinned to the bottom of the last page (above the footer).
      const SIGN_BLOCK_H = 52;
      const signTop = pageBottom() - SIGN_BLOCK_H;
      if (y > signTop - 8) {
        doc.addPage();
        y = startBodyY();
      }
      const colW = contentW / 3;
      const signY = signTop;
      [
        ['Prepared by', 'Accountant'],
        ['Reviewed by', 'Finance Officer'],
        ['Approved by', 'Principal / Director'],
      ].forEach(([label, role], index) => {
        const x = MARGIN + index * colW;
        doc.strokeColor(LINE).lineWidth(0.7);
        doc.moveTo(x + 10, signY).lineTo(x + colW - 18, signY).stroke();
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(7.5);
        pdfLine(doc, label, x, signY + 5, { width: colW - 8, align: 'center' });
        doc.fillColor(MUTED).font('Helvetica').fontSize(6.5);
        pdfLine(doc, role, x, signY + 15, { width: colW - 8, align: 'center' });
        doc.fillColor(MUTED).fontSize(6);
        pdfLine(doc, 'Date: _______________', x, signY + 28, { width: colW - 8, align: 'center' });
      });

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        drawPdfFooterTextPlain(doc, brand, 'Income & Expenditure', reportMeta, i + 1, range.count);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function getBalanceSheetPdf({ from, to, sessionId } = {}) {
  const sheet = await getBalanceSheet({ from, to, sessionId });
  const buffer = await renderBalanceSheetPdf(sheet);
  return { buffer, range: sheet.range };
}

module.exports = { getBalanceSheetPdf };
