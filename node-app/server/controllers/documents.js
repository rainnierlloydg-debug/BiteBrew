import PDFDocument from 'pdfkit';
import { db } from '../db.js';
import { audit } from '../lib/atomic.js';
import { fail } from '../lib/errors.js';
import { orderView } from '../services/orders.js';
import { report } from '../services/reports.js';
import { BRAND } from '../../public/shared/brand.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => 'PHP ' + Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
async function documentOrder(actor, id, kind) {
  if (!['receipt', 'kitchen'].includes(kind)) fail(404, 'NOT_FOUND', 'Document not found.');
  if (actor.role === 'KITCHEN' && kind !== 'kitchen') fail(403, 'FORBIDDEN', 'Financial receipts are not available to kitchen staff.');
  return orderView(db, id, actor);
}
export async function documentHtml(actor, id, kind) {
  const order = await documentOrder(actor, id, kind), kitchen = kind === 'kitchen';
  const business = kitchen ? { name: order.businessName || order.businessSnapshot?.name || BRAND.name } : order.businessSnapshot;
  const rows = order.items.map(item => `<tr><td><strong>${item.quantity} × ${escape(item.name)}</strong><small>${escape(item.variantName)}</small>${item.addons.map(addon => `<small>+ ${escape(addon.name)}</small>`).join('')}${item.instructions ? `<p>${escape(item.instructions)}</p>` : ''}${!kitchen ? `<small>@ ${money(item.unitPrice)}</small>` : ''}</td><td>${kitchen ? item.quantity : money(item.subtotal)}</td></tr>`).join('');
  const totals = kitchen ? '' : Object.entries({ Subtotal: order.subtotal, Discount: order.discount, Tax: order.pricingSnapshot.tax || '0', 'Service charge': order.pricingSnapshot.service || '0', TOTAL: order.total, 'Verified payments': order.paid, 'Remaining balance': order.balance, 'Refunds recorded': order.refunded }).map(([label, value]) => `<tr><td>${escape(label)}</td><td>${money(value)}</td></tr>`).join('');
  await audit(db, actor, 'document.viewed', 'orders', id, null, { kind });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(order.number)} · ${escape(kind)}</title><link rel="stylesheet" href="/css/print.css"><script type="module" src="/js/document.js"></script></head><body><main class="document" data-order="${escape(id)}" data-kind="${escape(kind)}"><h1>${escape(business.name)}</h1>${!kitchen ? `<p class="center">${escape(business.address)}<br>${escape(business.contact)}<br>${escape(business.hours)}</p><h2 class="center">Receipt</h2><p class="center small">Transaction acknowledgment<br>Not an official tax invoice</p>` : '<h2 class="center">Kitchen order slip</h2>'}<h2>${escape(order.number)}</h2><p>${date(order.createdAt)} · Asia/Manila<br>${escape(order.type.replaceAll('_', ' '))}${order.tableNumber ? ` · Table ${escape(order.tableNumber)}` : ''}${order.pickupAt ? `<br>Pickup: ${date(order.pickupAt)}` : ''}</p>${!kitchen ? `<p>${order.createdById ? 'Cashier' : 'Placed by'}: ${escape(order.createdByName)}<br>Customer: ${escape(order.customerName || 'Walk-in')}<br>Status: ${escape(order.status)}</p>` : ''}<table><thead><tr><th>Item</th><th>${kitchen ? 'Qty' : 'PHP'}</th></tr></thead><tbody>${rows}</tbody></table>${order.instructions ? `<p class="instructions">${escape(order.instructions)}</p>` : ''}${!kitchen ? `<table class="totals"><tbody>${totals}</tbody></table>${order.payments.map(payment => `<p>${escape(payment.method)} · ${escape(payment.status)} · ${money(payment.amount)}${payment.method === 'CASH' ? `<br>Tendered ${money(payment.tendered)} / Change ${money(payment.change)}` : ''}${payment.reference ? `<br>Ref: ${escape(payment.reference)}` : ''}</p>`).join('')}<p class="center">${escape(business.footer)}</p>` : ''}<div class="document-actions"><button id="print-document">Print ${kitchen ? 'kitchen slip' : 'receipt'}</button>${!kitchen ? `<a href="/documents/orders/${escape(id)}/receipt.pdf" download>Download PDF</a>` : ''}</div><p id="document-error" role="alert"></p></main></body></html>`;
}
export async function receiptPdf(actor, id, res) {
  const order = await documentOrder(actor, id, 'receipt'), business = order.businessSnapshot;
  await audit(db, actor, 'document.downloaded', 'orders', id, null, { kind: 'receipt' });
  res.type('pdf').attachment('receipt-' + order.number.replace(/[^a-zA-Z0-9_-]/g, '-') + '.pdf');
  const document = new PDFDocument({ size: 'A5', margin: 30 }); document.pipe(res);
  document.fontSize(20).text(business.name).fontSize(10).text(business.address).text(business.contact).text(business.hours).moveDown();
  document.fontSize(15).text('TRANSACTION ACKNOWLEDGMENT').fontSize(9).text('Not an official tax invoice').moveDown();
  document.fontSize(11).text(order.number).text(date(order.createdAt) + ' Asia/Manila').text((order.createdById ? 'Cashier: ' : 'Placed by: ') + order.createdByName).text('Customer: ' + (order.customerName || 'Walk-in')).text('Status: ' + order.status).moveDown();
  for (const item of order.items) { document.text(`${item.quantity} x ${item.name} — ${money(item.subtotal)}`).fontSize(9).text(`${item.variantName} @ ${money(item.unitPrice)}`); for (const addon of item.addons) document.text('+ ' + addon.name); if (item.instructions) document.text(item.instructions); document.fontSize(11).moveDown(.5); }
  if (order.instructions) document.text('Notes: ' + order.instructions).moveDown();
  for (const [label, value] of Object.entries({ Subtotal: order.subtotal, Discount: order.discount, Tax: order.pricingSnapshot.tax || '0', 'Service charge': order.pricingSnapshot.service || '0', Total: order.total, 'Verified payments': order.paid, 'Remaining balance': order.balance, Refunds: order.refunded })) document.text(label + ': ' + money(value));
  document.moveDown();
  for (const payment of order.payments) { document.text(`${payment.method} / ${payment.status}: ${money(payment.amount)}`); if (payment.method === 'CASH') document.text(`Tendered: ${money(payment.tendered)} / Change: ${money(payment.change)}`); if (payment.reference) document.text('Ref: ' + payment.reference); }
  document.moveDown().text(business.footer); document.end();
}
const financial = new Set(['amount', 'subtotal', 'discount', 'charges', 'total', 'paid', 'balance', 'grossSales', 'discounts', 'recognizedSales', 'salesRefunds', 'netSales', 'collections', 'sales', 'otherRefunds', 'refunds', 'netCollections', 'outstanding', 'refundObligations']);
function csvCell(value, key) {
  let text = value instanceof Date ? date(value) : String(value ?? '');
  if (!(financial.has(key) && /^-?\d+(\.\d+)?$/.test(text)) && /^[=+@\-]/.test(text.trimStart())) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function exportReport(actor, type, format, query, res) {
  if (!['csv', 'pdf'].includes(format)) fail(404, 'NOT_FOUND', 'Export format not found.');
  const result = await report(actor, type, query, true);
  if (format === 'pdf' && result.data.length > 3000) fail(422, 'PDF_TOO_LARGE', 'Use CSV or narrow the date range for PDF exports above 3,000 rows.');
  await audit(db, actor, 'report.exported', 'reports', type, null, { format, period: result.period, filters: result.filters });
  const filename = `bite-brew-${type}-${result.period.from}-${result.period.to}.${format}`;
  if (format === 'csv') {
    const keys = Object.keys(result.data[0] || {}), lines = [[result.business.name, type, result.period.from, result.period.to], ['Generated', date(result.generatedAt), 'Asia/Manila'], [], keys];
    const output = lines.map(row => row.map(value => csvCell(value)).join(','));
    for (const row of result.data) output.push(keys.map(key => csvCell(row[key], key)).join(','));
    output.push('', 'SUMMARY'); for (const [key, value] of Object.entries(result.summary)) output.push(csvCell(key) + ',' + csvCell(value, key));
    res.type('text/csv').attachment(filename).send('\uFEFF' + output.join('\r\n')); return;
  }
  res.type('pdf').attachment(filename);
  const document = new PDFDocument({ margin: 35 }); document.pipe(res);
  document.fontSize(20).text(result.business.name).fontSize(13).text(type.toUpperCase() + ' REPORT').fontSize(10).text(`${result.period.from} — ${result.period.to} · Asia/Manila`).text('Generated ' + date(result.generatedAt)).moveDown();
  for (const [key, value] of Object.entries(result.summary)) document.text(key + ': ' + (key === 'completedOrders' ? value : money(value)));
  document.moveDown();
  for (const row of result.data) { for (const [key, value] of Object.entries(row)) document.fontSize(9).text(key + ': ' + (value instanceof Date ? date(value) : String(value ?? '—'))); document.moveDown(); }
  document.addPage().fontSize(13).text('Definitions').fontSize(10); for (const [key, value] of Object.entries(result.definitions)) document.moveDown(.5).text(key + ': ' + value);
  document.end();
}
