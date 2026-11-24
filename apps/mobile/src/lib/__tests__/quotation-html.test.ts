import { describe, expect, it, jest } from '@jest/globals';

import { quotationHtml, type QuotationDoc } from '../quotation-html';

const base: QuotationDoc = {
  number: 'Q-2026-0001',
  version: 1,
  status: 'sent',
  issuedOn: '2026-11-24',
  validUntil: '2026-12-24',
  company: { name: 'DEV Group', address: 'Bhiti Rawat, Sahjanwa, Gorakhpur – 273209, Uttar Pradesh', phone: '+91 78975 93597', website: 'devgroupsn.com' },
  customer: { name: 'Alice Sharma', organization: null, contactPerson: 'Alice Sharma', phone: '9876543210', email: 'alice@example.com', address: null },
  enquiryNumber: 'ENQ-2026-0001',
  projectName: 'Ward 12 park',
  projectLocation: 'Gorakhpur',
  procurementReference: null,
  items: [{ description: 'RCC Bench', sku: 'FUR-RCC-BENCH', quantity: 10, unit: 'piece', unitPrice: 2200, taxRate: 18, lineTotal: 22000, lineTax: 3960 }],
  subtotal: 22000,
  tax: 3960,
  delivery: 1000,
  installation: 0,
  otherCharges: 0,
  discount: 0,
  grandTotal: 26960,
  terms: 'Prices are valid until the date shown. Taxes as applicable.',
  notes: null,
};

const longDescription = 'High Mast Complete Set with 12 × 400W LED flood fixtures, 16 m galvanised octagonal pole, winch, cable and foundation bolts. ';
const many = Array.from({ length: 45 }, (_, i) => {
  const quantity = i % 5 === 0 ? 1234.5 : 12;
  const unitPrice = i === 0 ? 9999999999.99 : i % 6 === 0 ? 29500000 : 750;
  const q = i === 0 ? 99.99 : quantity;
  const taxRate = i % 2 ? 18 : 12;
  const lineTotal = Math.round(q * unitPrice * 100) / 100;
  return {
    description: i % 7 === 0 ? longDescription.repeat(2) : `Street Light 45W ${i + 1}`,
    sku: i % 3 ? 'LGT-STREET-45W' : null,
    quantity: q,
    unit: i % 4 ? 'piece' : 'metre',
    unitPrice,
    taxRate,
    lineTotal,
    lineTax: Math.round(lineTotal * taxRate) / 100,
  };
});
const sum = (k: 'lineTotal' | 'lineTax') => Math.round(many.reduce((t, i) => t + i[k], 0) * 100) / 100;

/** Normal, worst-case and empty quotations. PREVIEW_DIR=… writes them out to render as PDFs. */
const SAMPLES: Record<string, QuotationDoc> = {
  basic: base,
  long: {
    ...base,
    version: 3,
    items: many,
    subtotal: sum('lineTotal'),
    tax: sum('lineTax'),
    delivery: 150000,
    installation: 250000.5,
    otherCharges: 12000,
    discount: 500000,
    grandTotal: Math.round((sum('lineTotal') + sum('lineTax') + 150000 + 250000.5 + 12000 - 500000) * 100) / 100,
    customer: {
      name: 'Rakesh Kumar Srivastava',
      organization: 'Nagar Nigam Gorakhpur — Public Works & Street Lighting Department (Zone 4)',
      contactPerson: 'Executive Engineer (Electrical)',
      phone: '9876543210',
      email: 'ee.electrical.zone4.nagarnigam.gorakhpur@example.gov.in',
      address: 'Town Hall, Golghar\nGorakhpur 273001, Uttar Pradesh',
    },
    procurementReference: 'GEM/2026/B/1234567 dated 12/11/2026',
    projectName: 'Smart street lighting – phase 2 (रामगढ़ ताल)',
    terms:
      '1. 50% advance with PO, balance before dispatch.\n2. Delivery within 30 days of advance.\n3. Installation by DEV Group team; civil work by client.\n4. Warranty: 2 years on LED fixtures, 5 years on poles.',
    notes: 'Rates <b>not</b> valid for partial quantities & "split" deliveries.',
  },
  empty: {
    ...base,
    status: 'draft',
    items: [],
    subtotal: 0,
    tax: 0,
    delivery: 0,
    grandTotal: 0,
    issuedOn: null,
    validUntil: null,
    enquiryNumber: null,
    projectName: null,
    projectLocation: null,
    terms: null,
    customer: { name: null, organization: null, contactPerson: null, phone: null, email: null, address: null },
    company: { name: 'DEV Group', gstin: '09ABCDE1234F1Z5' },
  },
};

describe('quotationHtml', () => {
  it('prints the lines, totals and amount in words', () => {
    const html = quotationHtml(base);
    expect(html).toContain('Q-2026-0001');
    expect(html).toContain('22,000.00');
    expect(html).toContain('₹26,960.00');
    expect(html).toContain('Rupees Twenty Six Thousand Nine Hundred Sixty Only');
    expect(html).not.toContain('DRAFT');
  });

  it('escapes anything people typed', () => {
    const html = quotationHtml(SAMPLES.long);
    expect(html).toContain('Rates &lt;b&gt;not&lt;/b&gt; valid');
    expect(html).toContain('Public Works &amp; Street Lighting');
    expect(html).not.toContain('<b>not</b>');
  });

  it('copes with no items, no dates and no customer details, and marks drafts', () => {
    const html = quotationHtml(SAMPLES.empty);
    expect(html).toContain('No items');
    expect(html).toContain('DRAFT');
    expect(html).toContain('GSTIN: <strong>09ABCDE1234F1Z5</strong>');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('splits GST by rate', () => {
    const html = quotationHtml(SAMPLES.long);
    expect(html).toMatch(/<td>12%<\/td>/);
    expect(html).toMatch(/<td>18%<\/td>/);
  });

  const dir = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PREVIEW_DIR;
  (dir ? it : it.skip)('writes previews', () => {
    const { writeFileSync } = jest.requireActual<{ writeFileSync: (path: string, data: string) => void }>('fs');
    for (const [k, d] of Object.entries(SAMPLES)) writeFileSync(`${dir}/${k}.html`, quotationHtml(d));
  });
});
