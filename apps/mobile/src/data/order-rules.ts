/**
 * Order and payment vocabulary shared by the customer and staff screens (design doc §19-22).
 * No Supabase imports here, so it can be unit tested on its own. The server decides
 * which moves are allowed; ORDER_MOVES mirrors it only to choose which buttons to show.
 */
import type { Tone } from '@/data/commercial';

export type OrderStatus =
  | 'payment_pending'
  | 'confirmed'
  | 'processing'
  | 'in_progress'
  | 'ready_for_dispatch'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export type OrderPaymentStatus = 'unpaid' | 'under_review' | 'partially_paid' | 'paid' | 'rejected';
export type PaymentMethod = 'bank_transfer' | 'upi' | 'cheque' | 'cash' | 'other';
export type PaymentState = 'submitted' | 'verified' | 'rejected';
export type DocumentType =
  | 'GST_CERTIFICATE'
  | 'PAN'
  | 'QUOTATION_PDF'
  | 'PURCHASE_ORDER'
  | 'INVOICE'
  | 'PAYMENT_PROOF'
  | 'DELIVERY_DOCUMENT'
  | 'PROJECT_DOCUMENT'
  | 'OTHER';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; staff: string }> = {
  payment_pending: { label: 'Payment pending', tone: 'action', staff: 'Payment pending' },
  confirmed: { label: 'Confirmed', tone: 'info', staff: 'Confirmed' },
  processing: { label: 'Processing', tone: 'info', staff: 'Processing' },
  in_progress: { label: 'In progress', tone: 'info', staff: 'In progress' },
  ready_for_dispatch: { label: 'Ready for dispatch', tone: 'info', staff: 'Ready for dispatch' },
  out_for_delivery: { label: 'Out for delivery', tone: 'info', staff: 'Out for delivery' },
  completed: { label: 'Completed', tone: 'success', staff: 'Completed' },
  cancelled: { label: 'Cancelled', tone: 'neutral', staff: 'Cancelled' },
  disputed: { label: 'Under discussion', tone: 'warning', staff: 'Disputed' },
};

export const PAYMENT_STATUS: Record<OrderPaymentStatus, { label: string; tone: Tone }> = {
  unpaid: { label: 'Unpaid', tone: 'action' },
  under_review: { label: 'Payment being checked', tone: 'info' },
  partially_paid: { label: 'Partly paid', tone: 'action' },
  paid: { label: 'Paid', tone: 'success' },
  rejected: { label: 'Payment not accepted', tone: 'error' },
};

export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: Tone }> = {
  submitted: { label: 'Being checked', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Not accepted', tone: 'error' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer (NEFT/RTGS/IMPS)',
  upi: 'UPI',
  cheque: 'Cheque / DD',
  cash: 'Cash',
  other: 'Other',
};

export const DOCUMENT_TYPE: Record<DocumentType, string> = {
  GST_CERTIFICATE: 'GST certificate',
  PAN: 'PAN',
  QUOTATION_PDF: 'Quotation',
  PURCHASE_ORDER: 'Purchase order',
  INVOICE: 'Invoice',
  PAYMENT_PROOF: 'Payment proof',
  DELIVERY_DOCUMENT: 'Delivery document',
  PROJECT_DOCUMENT: 'Project document',
  OTHER: 'Other',
};

/** What customers may upload; invoices and delivery papers come from DEV. */
export const CUSTOMER_DOCUMENT_TYPES: DocumentType[] = ['PURCHASE_ORDER', 'GST_CERTIFICATE', 'PAN', 'PROJECT_DOCUMENT', 'OTHER'];

/** The happy path, in order, for the customer's timeline (§22). */
export const ORDER_STAGES: OrderStatus[] = [
  'payment_pending',
  'confirmed',
  'processing',
  'in_progress',
  'ready_for_dispatch',
  'out_for_delivery',
  'completed',
];

/** Mirrors allowed_order_moves() in the database. */
export const ORDER_MOVES: Record<OrderStatus, OrderStatus[]> = {
  payment_pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['in_progress', 'cancelled'],
  in_progress: ['ready_for_dispatch', 'disputed'],
  ready_for_dispatch: ['out_for_delivery', 'disputed'],
  out_for_delivery: ['completed', 'disputed'],
  completed: ['disputed'],
  disputed: ['in_progress', 'completed', 'cancelled'],
  cancelled: [],
};

/** Button wording for a staff member moving the order on. */
export const MOVE_LABEL: Record<OrderStatus, string> = {
  payment_pending: 'Back to payment pending',
  confirmed: 'Confirm order',
  processing: 'Start processing',
  in_progress: 'Mark in progress',
  ready_for_dispatch: 'Ready for dispatch',
  out_for_delivery: 'Out for delivery',
  completed: 'Mark completed',
  cancelled: 'Cancel order',
  disputed: 'Mark disputed',
};

export type StageState = 'done' | 'current' | 'todo';

/**
 * The customer's progress list: every stage on the happy path with whether it is done,
 * current or still to come. A cancelled or disputed order keeps the stages it reached
 * as done and shows nothing as current.
 */
export function orderStages(status: OrderStatus, reached: OrderStatus[]): { status: OrderStatus; state: StageState }[] {
  const at = ORDER_STAGES.indexOf(status);
  if (at >= 0) {
    return ORDER_STAGES.map((s, i) => ({ status: s, state: i < at ? 'done' : i === at ? (s === 'completed' ? 'done' : 'current') : 'todo' }));
  }
  const furthest = Math.max(-1, ...reached.map((s) => ORDER_STAGES.indexOf(s)));
  return ORDER_STAGES.map((s, i) => ({ status: s, state: i <= furthest ? 'done' : 'todo' }));
}

/** Amount still to pay; what's being checked doesn't count as paid yet. */
export function amountDue(grandTotal: number, paidAmount: number): number {
  return Math.max(0, Math.round((grandTotal - paidAmount) * 100) / 100);
}

/** Customers can record a payment while something is due and the order is open. */
export function canRecordPayment(status: OrderStatus, grandTotal: number, paidAmount: number, pending: number): boolean {
  return status !== 'cancelled' && status !== 'completed' && amountDue(grandTotal, paidAmount) - pending > 0;
}

export const ORDER_EVENT_LABEL: Record<string, string> = {
  CREATED: 'Order created',
  STATUS: 'Status updated',
  NOTE: 'Note',
  DOCUMENT: 'File added',
  PAYMENT_SUBMITTED: 'Payment details sent',
  PAYMENT_VERIFIED: 'Payment verified',
  PAYMENT_REJECTED: 'Payment not accepted',
};

/** Files: PDFs and photos up to 10 MB (the storage bucket enforces the same). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** A storage-safe file name that keeps the extension, e.g. "PO 12/2026 (final).pdf" → "PO-12-2026-final.pdf". */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'file'}${ext ? '.' + ext : ''}`;
}
