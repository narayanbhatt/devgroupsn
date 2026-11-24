import { rupeesInWords } from '@/lib/amount-words';
import { formatINR } from '@/lib/format';

/** Everything printed on a quotation (§17, §53). Pure, so it can be tested and previewed anywhere. */
export interface QuotationDoc {
  number: string;
  version: number;
  status: string;
  issuedOn: string | null; // YYYY-MM-DD
  validUntil: string | null;
  company: { name: string; address?: string; phone?: string; email?: string; gstin?: string; website?: string };
  customer: {
    name: string | null;
    organization: string | null;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  enquiryNumber: string | null;
  projectName: string | null;
  projectLocation: string | null;
  procurementReference: string | null;
  items: { description: string; sku: string | null; quantity: number; unit: string; unitPrice: number; taxRate: number; lineTotal: number; lineTax: number }[];
  subtotal: number;
  tax: number;
  delivery: number;
  installation: number;
  otherCharges: number;
  discount: number;
  grandTotal: number;
  terms: string | null;
  notes: string | null;
}

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Escaped text with its line breaks kept. */
const multiline = (s: string | null | undefined) => esc(s).replace(/\r?\n/g, '<br>');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function day(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/** Quantities: no trailing .00 for whole numbers, Indian grouping. */
function qty(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/** Rupees always with two decimals, so the columns line up. */
function money(n: number): string {
  const s = formatINR(n);
  return s.includes('.') ? s : `${s}.00`;
}

/** Table cells drop the ₹ (the column header carries it) to leave room for crore amounts. */
const plain = (n: number) => money(n).replace('₹', '');

/** A table cell for an amount; very large amounts (₹100 crore and up) get a smaller font so they stay inside the column. */
const amountCell = (n: number) => {
  const text = plain(n);
  return `<td class="num${text.length > 14 ? ' long' : ''}">${text}</td>`;
};

const row = (label: string, amount: number, cls = '') =>
  `<tr class="${cls}"><td>${esc(label)}</td><td class="num">${cls === 'minus' ? '− ' : ''}${money(amount)}</td></tr>`;

/** GST split by rate, which Indian buyers expect to see when a quotation mixes rates. */
function taxByRate(items: QuotationDoc['items']) {
  const m = new Map<number, { taxable: number; tax: number }>();
  for (const i of items) {
    const t = m.get(i.taxRate) ?? { taxable: 0, tax: 0 };
    t.taxable += i.lineTotal;
    t.tax += i.lineTax;
    m.set(i.taxRate, t);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export function quotationHtml(q: QuotationDoc): string {
  const c = q.company;
  const companyLines = [c.address, [c.phone, c.email].filter(Boolean).join(' · '), c.website].filter(Boolean);
  const cust = q.customer;
  const billTo = [
    cust.organization ? `<strong>${esc(cust.organization)}</strong>` : cust.name ? `<strong>${esc(cust.name)}</strong>` : '',
    cust.organization && cust.name ? esc(cust.name) : '',
    cust.contactPerson && cust.contactPerson !== cust.name ? `Attn: ${esc(cust.contactPerson)}` : '',
    cust.address ? multiline(cust.address) : '',
    [cust.phone, cust.email].filter(Boolean).map(esc).join(' · '),
  ].filter(Boolean);
  const project = [
    ['Enquiry', q.enquiryNumber],
    ['Project', q.projectName],
    ['Location', q.projectLocation],
    ['Tender / reference', q.procurementReference],
  ].filter(([, v]) => v);
  const rates = taxByRate(q.items);
  const draft = q.status === 'draft';

  const lines = q.items.length
    ? q.items
        .map(
          (i, n) => `<tr>
  <td class="c">${n + 1}</td>
  <td class="desc">${esc(i.description)}${i.sku ? `<div class="sku">${esc(i.sku)}</div>` : ''}</td>
  <td class="num">${qty(i.quantity)}<div class="unit">${esc(i.unit)}</div></td>
  ${amountCell(i.unitPrice)}
  <td class="num">${qty(i.taxRate)}%</td>
  ${amountCell(i.lineTotal)}
</tr>`,
        )
        .join('\n')
    : `<tr><td colspan="6" class="empty">No items</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(q.number)} v${q.version}</title>
<style>
  @page {
    size: A4; margin: 14mm 12mm 18mm;
    @bottom-left { content: "${esc(q.number)}${q.version > 1 ? ` rev. ${q.version}` : ''}"; font-family: Roboto, Arial, sans-serif; font-size: 8pt; color: #4A5565; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Roboto, Arial, sans-serif; font-size: 8pt; color: #4A5565; }
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Roboto', 'Noto Sans', 'Noto Sans Devanagari', Arial, sans-serif; color: #1B2430; font-size: 10.5pt; line-height: 1.4; margin: 0; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .c { text-align: center; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0B1F3A; padding-bottom: 10px; }
  .brand { font-size: 18pt; font-weight: 800; color: #0B1F3A; letter-spacing: 0.5px; }
  .company { font-size: 9pt; color: #4A5565; max-width: 95mm; overflow-wrap: anywhere; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 16pt; color: #F26B1D; letter-spacing: 2px; }
  .doc table { margin-left: auto; font-size: 9.5pt; border-collapse: collapse; }
  .doc td { padding: 1px 0 1px 10px; white-space: nowrap; }
  .doc td:first-child { color: #4A5565; }
  .parties { display: flex; gap: 16px; margin: 12px 0; }
  .parties > div { flex: 1; min-width: 0; border: 1px solid #DCE1E8; border-radius: 6px; padding: 8px 10px; overflow-wrap: anywhere; }
  .label { font-size: 8pt; font-weight: 700; color: #4A5565; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px; }
  .parties table td { padding: 0 8px 0 0; vertical-align: top; }
  .parties table td:first-child { color: #4A5565; white-space: nowrap; }
  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.items thead { display: table-header-group; }
  table.items th { background: #0B1F3A; color: #fff; font-size: 8.5pt; font-weight: 600; padding: 6px; text-align: left; }
  table.items th.num { text-align: right; }
  table.items td { border-bottom: 1px solid #DCE1E8; padding: 6px 5px; vertical-align: top; }
  table.items td.num { font-size: 9.5pt; }
  table.items td.num.long { font-size: 8pt; }
  table.items tr { page-break-inside: avoid; break-inside: avoid; }
  .desc { overflow-wrap: anywhere; }
  .sku, .unit { font-size: 8pt; color: #4A5565; }
  .empty { text-align: center; color: #4A5565; padding: 16px; }
  .summary { display: flex; gap: 16px; margin-top: 10px; page-break-inside: avoid; break-inside: avoid; }
  .summary .left { flex: 1; min-width: 0; font-size: 9pt; }
  .summary .right { width: 78mm; }
  .totals { width: 100%; border-collapse: collapse; }
  .totals td { padding: 3px 6px; }
  .totals td:first-child { white-space: nowrap; }
  .totals tr.minus td { color: #157347; }
  .totals tr.grand td { border-top: 2px solid #0B1F3A; font-size: 12pt; font-weight: 800; padding-top: 6px; }
  .gst { border-collapse: collapse; font-size: 8.5pt; margin-top: 4px; }
  .gst td, .gst th { border: 1px solid #DCE1E8; padding: 2px 6px; }
  .gst th { background: #F3F5F8; font-weight: 600; }
  .words { margin-top: 8px; font-weight: 600; overflow-wrap: anywhere; }
  .terms { margin-top: 14px; font-size: 9pt; overflow-wrap: anywhere; page-break-inside: avoid; break-inside: avoid; }
  .sign { margin-top: 20px; display: flex; justify-content: flex-end; page-break-inside: avoid; break-inside: avoid; }
  .sign > div { text-align: center; font-size: 9pt; width: 62mm; }
  .sign .space { height: 16mm; border-bottom: 1px solid #1B2430; margin: 4px 0; }
  footer { margin-top: 18px; font-size: 8pt; color: #4A5565; text-align: center; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 80pt; font-weight: 800; color: rgba(242, 107, 29, 0.12); transform: rotate(-30deg); z-index: -1; }
</style></head>
<body>
${draft ? '<div class="watermark">DRAFT</div>' : ''}
<header>
  <div>
    <div class="brand">${esc(c.name || 'DEV Group')}</div>
    <div class="company">${companyLines.map(esc).join('<br>')}${c.gstin ? `<br>GSTIN: <strong>${esc(c.gstin)}</strong>` : ''}</div>
  </div>
  <div class="doc">
    <h1>QUOTATION</h1>
    <table>
      <tr><td>Number</td><td><strong>${esc(q.number)}</strong>${q.version > 1 ? ` (rev. ${q.version})` : ''}</td></tr>
      <tr><td>Date</td><td>${day(q.issuedOn)}</td></tr>
      <tr><td>Valid until</td><td>${day(q.validUntil)}</td></tr>
    </table>
  </div>
</header>

<section class="parties">
  <div><div class="label">Quotation for</div>${billTo.join('<br>') || '—'}</div>
  ${project.length ? `<div><div class="label">Project</div><table>${project.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>` : ''}
</section>

<table class="items">
  <colgroup><col style="width:8mm"><col><col style="width:21mm"><col style="width:31mm"><col style="width:12mm"><col style="width:37mm"></colgroup>
  <thead><tr><th class="c">#</th><th>Description</th><th class="num">Qty</th><th class="num">Rate (₹)</th><th class="num">GST</th><th class="num">Amount (₹)</th></tr></thead>
  <tbody>
${lines}
  </tbody>
</table>

<section class="summary">
  <div class="left">
    ${
      rates.length
        ? `<div class="label">GST summary</div>
    <table class="gst"><tr><th>Rate</th><th class="num">Taxable (₹)</th><th class="num">GST (₹)</th></tr>
    ${rates.map(([r, t]) => `<tr><td>${qty(r)}%</td><td class="num">${plain(t.taxable)}</td><td class="num">${plain(t.tax)}</td></tr>`).join('')}
    </table>`
        : ''
    }
    <div class="words">${rupeesInWords(q.grandTotal)}</div>
  </div>
  <div class="right">
    <table class="totals">
      ${row('Subtotal', q.subtotal)}
      ${row('GST', q.tax)}
      ${q.delivery > 0 ? row('Delivery', q.delivery) : ''}
      ${q.installation > 0 ? row('Installation', q.installation) : ''}
      ${q.otherCharges > 0 ? row('Other charges', q.otherCharges) : ''}
      ${q.discount > 0 ? row('Discount', q.discount, 'minus') : ''}
      ${row('Total', q.grandTotal, 'grand')}
    </table>
  </div>
</section>

${q.terms ? `<section class="terms"><div class="label">Terms and conditions</div>${multiline(q.terms)}</section>` : ''}
${q.notes ? `<section class="terms"><div class="label">Notes</div>${multiline(q.notes)}</section>` : ''}

<div class="sign"><div>For <strong>${esc(c.name || 'DEV Group')}</strong><div class="space"></div>Authorised signatory</div></div>
<footer>Prices in Indian Rupees. This quotation is computer generated.</footer>
</body></html>`;
}
