/**
 * Enquiry and quotation vocabulary shared by the customer and staff screens,
 * plus the small calculations the app shows before the server confirms them.
 * No Supabase imports here, so it can be unit tested on its own.
 */

export type EnquiryStatus =
  | 'submitted'
  | 'under_review'
  | 'requirement_clarification'
  | 'quote_preparation'
  | 'quoted'
  | 'revision_requested'
  | 'approved'
  | 'converted_to_order'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'revision_requested'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'superseded'
  | 'converted';

export type Tone = 'neutral' | 'info' | 'action' | 'success' | 'warning' | 'error';

/** What customers read for each enquiry status. */
export const ENQUIRY_STATUS: Record<EnquiryStatus, { label: string; tone: Tone; hint: string }> = {
  submitted: { label: 'Submitted', tone: 'info', hint: 'We have your enquiry and will review it shortly.' },
  under_review: { label: 'Under review', tone: 'info', hint: 'Our team is reviewing your requirements.' },
  requirement_clarification: {
    label: 'Need more details',
    tone: 'action',
    hint: 'We need a few more details. Check Chat or expect a call from us.',
  },
  quote_preparation: { label: 'Preparing quotation', tone: 'info', hint: 'Your quotation is being prepared.' },
  quoted: { label: 'Quotation ready', tone: 'action', hint: 'Your quotation is ready. Review and approve it.' },
  revision_requested: { label: 'Revision requested', tone: 'info', hint: 'We are revising the quotation as you asked.' },
  approved: { label: 'Approved', tone: 'success', hint: 'You approved the quotation. We will confirm your order.' },
  converted_to_order: { label: 'Order placed', tone: 'success', hint: 'This enquiry is now an order.' },
  rejected: { label: 'Closed', tone: 'neutral', hint: 'This enquiry was closed.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', hint: 'This enquiry was cancelled.' },
  expired: { label: 'Quotation expired', tone: 'warning', hint: 'The quotation expired. Ask us for a new one.' },
};

export const QUOTATION_STATUS: Record<QuotationStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Awaiting your approval', tone: 'action' },
  viewed: { label: 'Awaiting your approval', tone: 'action' },
  revision_requested: { label: 'Revision requested', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Declined', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  superseded: { label: 'Replaced by a newer version', tone: 'neutral' },
  converted: { label: 'Order placed', tone: 'success' },
};

/** Staff see the plain workflow name instead of the customer wording. */
export const QUOTATION_STATUS_STAFF: Record<QuotationStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed by customer',
  revision_requested: 'Revision requested',
  approved: 'Approved',
  rejected: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  superseded: 'Superseded',
  converted: 'Converted to order',
};

export const ENQUIRY_STATUS_STAFF: Record<EnquiryStatus, string> = {
  submitted: 'New',
  under_review: 'Under review',
  requirement_clarification: 'Clarification needed',
  quote_preparation: 'Quote in preparation',
  quoted: 'Quoted',
  revision_requested: 'Revision requested',
  approved: 'Approved',
  converted_to_order: 'Converted to order',
  rejected: 'Rejected',
  cancelled: 'Cancelled by customer',
  expired: 'Expired',
};

/** Enquiries the team still has to act on. */
export const OPEN_FOR_STAFF: EnquiryStatus[] = [
  'submitted',
  'under_review',
  'requirement_clarification',
  'quote_preparation',
  'revision_requested',
];

export interface LineInput {
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface Charges {
  discount: number;
  delivery: number;
  installation: number;
  otherCharges: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Same rule as the database (recalc_quotation): GST per line, extra charges added
 * as entered, discount taken off, never below zero.
 */
export function quotationTotals(lines: LineInput[], c: Charges) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const line = round2(l.quantity * l.unitPrice);
    subtotal += line;
    tax += round2((l.quantity * l.unitPrice * l.taxRate) / 100);
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  const grandTotal = Math.max(0, round2(subtotal + tax + c.delivery + c.installation + c.otherCharges - c.discount));
  return { subtotal, tax, grandTotal };
}

/** Indicative basket value from listed prices; items priced on quotation are counted separately. */
export function estimateBasket(items: { listedPrice: number | null; quantity: number }[]) {
  let value = 0;
  let unpriced = 0;
  for (const i of items) {
    if (i.listedPrice == null) unpriced++;
    else value += i.listedPrice * i.quantity;
  }
  return { value: round2(value), unpriced };
}

/**
 * Reads a date typed as DD/MM/YYYY (or DD-MM-YYYY) and returns YYYY-MM-DD,
 * or null if it isn't a real calendar date.
 */
export function parseIndianDate(text: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** YYYY-MM-DD to "30 Nov 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Today's date in India as YYYY-MM-DD (quotation validity is counted in IST). */
export function todayInIndia(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Whether a quotation is still open for the customer to answer. */
export function canAnswer(status: QuotationStatus, validUntil: string | null, today = todayInIndia()) {
  return (status === 'sent' || status === 'viewed') && validUntil != null && validUntil >= today;
}

/** Parses a rupee amount typed by staff ("1,25,000", "₹ 900.50"). Null if not a number >= 0. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s₹]/g, '');
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}
