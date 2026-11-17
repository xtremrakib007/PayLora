import PDFDocument from 'pdfkit';
import type { PayslipData } from './engine';

export type PdfCompany = { name: string; regNo?: string | null; address?: string | null; email?: string | null; phone?: string | null; currency: string };
export type PdfSlip = { period: string; status: string; data: PayslipData };

const BRAND = '#0d6b5c', INK = '#10201d', MUTED = '#5f6d6a', LINE = '#e1e7e5', TINT = '#e6f2ef';
const fmt = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const monthLabel = (p: string) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Render one or more payslips (one A4 page each) to a PDF buffer. */
export function renderPayslips(co: PdfCompany, slips: PdfSlip[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Payslip', Author: co.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
    slips.forEach((s, i) => { if (i) doc.addPage(); drawSlip(doc, co, s); });
    if (!slips.length) doc.text('No payslips', 40, 40);
    doc.end();
  });
}

function drawSlip(doc: PDFKit.PDFDocument, co: PdfCompany, s: PdfSlip) {
  const W = 595.28, M = 40, d = s.data;
  doc.rect(0, 0, W, 92).fill(BRAND);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(17).text(co.name, M, 26, { width: 330 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#d6ebe6');
  const sub = [co.regNo && `Reg. No. ${co.regNo}`, co.address].filter(Boolean).join('  |  ');
  if (sub) doc.text(sub, M, 50, { width: 340, height: 22, ellipsis: true });
  const contact = [co.email, co.phone].filter(Boolean).join('  |  ');
  if (contact) doc.text(contact, M, 72, { width: 340 });
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22).text('PAYSLIP', W - M - 200, 24, { width: 200, align: 'right' });
  doc.font('Helvetica').fontSize(11).text(monthLabel(s.period), W - M - 200, 52, { width: 200, align: 'right' });
  if (s.status === 'DRAFT') doc.font('Helvetica-Bold').fillColor('#ffd28c').text('DRAFT', W - M - 200, 68, { width: 200, align: 'right' });

  // employee details
  const info: [string, string][] = [
    ['Employee', d.employee.name], ['Employee code', d.employee.code], ['Designation', d.employee.designation], ['Department', d.employee.department],
    ['IC / Passport', d.employee.icNo], ['EPF no.', d.employee.epfNo], ['Tax no.', d.employee.taxNo], ['Bank account', [d.employee.bankName, d.employee.bankAccount].filter(Boolean).join(' ')],
  ];
  let y = 112;
  info.forEach(([k, v], i) => {
    const x = i % 2 ? 310 : M, yy = y + Math.floor(i / 2) * 18;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(k, x, yy);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(v || '-', x + 82, yy - 1, { width: 160, ellipsis: true, lineBreak: false });
  });
  y += 4 * 18 + 14;

  const earn: [string, number][] = [['Basic salary', d.basic], ...d.allowances.map((a) => [a.name, a.amount] as [string, number])];
  if (d.otPay) earn.push([`Overtime (${d.otHours} h)`, d.otPay]);
  if (d.bonus) earn.push(['Bonus / commission', d.bonus]);
  if (d.otherEarnings) earn.push(['Other earnings', d.otherEarnings]);
  if (d.unpaidDeduction) earn.push([`Unpaid leave / absence (${d.unpaidDays} d)`, -d.unpaidDeduction]);
  if (d.lateDeduction) earn.push([`Late arrival (${fmtMins(d.lateMinutes)})`, -d.lateDeduction]);
  if (d.earlyDeduction) earn.push([`Early leave (${fmtMins(d.earlyMinutes)})`, -d.earlyDeduction]);
  const ded: [string, number][] = d.statutory.filter((x) => x.employee).map((x) => [`${x.name} (employee)`, x.employee] as [string, number]);
  if (d.tax) ded.push(['Income tax (PCB)', d.tax]);
  d.deductions.forEach((x) => ded.push([x.name, x.amount]));
  if (d.otherDeduction) ded.push(['Other deduction', d.otherDeduction]);

  const colW = (W - 2 * M - 20) / 2, xL = M, xR = M + colW + 20;
  const head = (x: number, t: string) => {
    doc.rect(x, y, colW, 22).fill(TINT);
    doc.fillColor('#0a5649').font('Helvetica-Bold').fontSize(9).text(t, x + 8, y + 7).text(co.currency, x + 8, y + 7, { width: colW - 16, align: 'right' });
  };
  head(xL, 'EARNINGS'); head(xR, 'DEDUCTIONS');
  y += 22;
  const rows = Math.max(earn.length, ded.length, 1);
  doc.font('Helvetica').fontSize(9.5).fillColor(INK);
  for (let i = 0; i < rows; i++) {
    const yy = y + 8 + i * 20;
    const cell = (x: number, r?: [string, number]) => {
      if (!r) return;
      doc.fillColor(INK).text(r[0], x + 8, yy, { width: colW - 90, ellipsis: true, lineBreak: false });
      doc.text((r[1] < 0 ? '-' : '') + fmt(Math.abs(r[1])), x + 8, yy, { width: colW - 16, align: 'right' });
    };
    cell(xL, earn[i]); cell(xR, ded[i]);
    doc.moveTo(xL, yy + 14).lineTo(xL + colW, yy + 14).moveTo(xR, yy + 14).lineTo(xR + colW, yy + 14).strokeColor('#eef2f1').lineWidth(0.6).stroke();
  }
  y += 8 + rows * 20 + 4;
  doc.moveTo(xL, y).lineTo(xL + colW, y).moveTo(xR, y).lineTo(xR + colW, y).strokeColor('#c8d2cf').lineWidth(1.2).stroke();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  doc.text('Gross earnings', xL + 8, y + 8).text(fmt(d.gross), xL + 8, y + 8, { width: colW - 16, align: 'right' });
  doc.text('Total deductions', xR + 8, y + 8).text(fmt(d.totalDeductions), xR + 8, y + 8, { width: colW - 16, align: 'right' });
  y += 32;

  if (d.reimbursements.length) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0a5649').text('REIMBURSEMENTS (non-taxable)', M, y);
    y += 14;
    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    d.reimbursements.forEach((r) => { doc.text(r.name, M + 8, y, { width: 300 }).text(fmt(r.amount), M, y, { width: colW - 8, align: 'right' }); y += 16; });
    y += 6;
  }

  doc.roundedRect(M, y, W - 2 * M, 46, 6).fill(BRAND);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(12).text('NET PAY', M + 16, y + 17);
  doc.fontSize(20).text(`${co.currency} ${fmt(d.net)}`, M, y + 13, { width: W - 2 * M - 16, align: 'right' });
  y += 62;

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  const er = d.statutory.filter((x) => x.employer);
  if (er.length) { doc.text('Employer contributions (not deducted from pay): ' + er.map((x) => `${x.name} ${fmt(x.employer)}`).join('   '), M, y, { width: W - 2 * M }); y += 16; }
  if (d.note) doc.text(`Note: ${d.note}`, M, y, { width: W - 2 * M });

  doc.moveTo(M, 800).lineTo(W - M, 800).strokeColor(LINE).lineWidth(0.8).stroke();
  doc.fontSize(8).fillColor(MUTED).text('This is a computer-generated payslip and does not require a signature.', M, 808, { lineBreak: false });
  doc.text(`Generated ${new Date().toLocaleDateString('en-GB')}`, M, 808, { width: W - 2 * M, align: 'right', lineBreak: false });
}
