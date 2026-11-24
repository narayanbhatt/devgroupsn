/**
 * Staff dashboard figures (wireframe A01), worked out from the enquiry and order lists.
 * No Supabase imports here, so it can be unit tested on its own.
 */
import type { EnquiryStatus } from '@/data/commercial';
import type { OrderPaymentStatus, OrderStatus } from '@/data/order-rules';

export interface DashEnquiry {
  id: string;
  number: string;
  status: EnquiryStatus;
  submittedAt: string;
  customerName: string | null;
  organizationName: string | null;
}

export interface DashOrder {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  grandTotal: number;
  paidAmount: number;
  createdAt: string;
  customerName: string | null;
  organizationName: string | null;
}

export interface ActionItem {
  key: string;
  kind: 'enquiry' | 'order';
  id: string;
  number: string;
  who: string;
  reason: string;
  amount: number | null;
  at: string;
  /** Lower comes first. */
  rank: number;
}

export interface DashboardStats {
  actions: ActionItem[];
  activeOrders: number;
  received: number;
  outstanding: number;
  newEnquiries: number;
  withCustomer: number;
  toDeliver: number;
  completed: number;
}

const ENQUIRY_ACTION: Partial<Record<EnquiryStatus, { reason: string; rank: number }>> = {
  approved: { reason: 'Approved, create order', rank: 0 },
  submitted: { reason: 'New enquiry', rank: 2 },
  revision_requested: { reason: 'Revision requested', rank: 2 },
  under_review: { reason: 'Prepare quotation', rank: 3 },
  quote_preparation: { reason: 'Finish quotation', rank: 3 },
  requirement_clarification: { reason: 'Waiting for customer details', rank: 4 },
};

const CLOSED_ORDER: OrderStatus[] = ['completed', 'cancelled'];
const DELIVERY_STAGES: OrderStatus[] = ['ready_for_dispatch', 'out_for_delivery'];

const who = (r: { organizationName: string | null; customerName: string | null }) =>
  r.organizationName || r.customerName || 'Customer';

export function dashboardStats(enquiries: DashEnquiry[], orders: DashOrder[]): DashboardStats {
  const actions: ActionItem[] = [];
  for (const e of enquiries) {
    const a = ENQUIRY_ACTION[e.status];
    if (!a) continue;
    actions.push({ key: `e:${e.id}`, kind: 'enquiry', id: e.id, number: e.number, who: who(e), reason: a.reason, amount: null, at: e.submittedAt, rank: a.rank });
  }
  for (const o of orders) {
    let reason: string | null = null;
    let rank = 9;
    if (o.paymentStatus === 'under_review') [reason, rank] = ['Payment to verify', 1];
    else if (o.status === 'disputed') [reason, rank] = ['Disputed', 1];
    else if (o.status === 'payment_pending' && o.paymentStatus !== 'unpaid') [reason, rank] = ['Payment received, confirm order', 2];
    if (reason) {
      actions.push({ key: `o:${o.id}`, kind: 'order', id: o.id, number: o.number, who: who(o), reason, amount: o.grandTotal, at: o.createdAt, rank });
    }
  }
  // Most urgent first; oldest first within the same urgency.
  actions.sort((a, b) => a.rank - b.rank || a.at.localeCompare(b.at));

  const live = orders.filter((o) => o.status !== 'cancelled');
  return {
    actions,
    activeOrders: orders.filter((o) => !CLOSED_ORDER.includes(o.status)).length,
    received: live.reduce((s, o) => s + o.paidAmount, 0),
    outstanding: live.reduce((s, o) => s + Math.max(0, o.grandTotal - o.paidAmount), 0),
    newEnquiries: enquiries.filter((e) => e.status === 'submitted').length,
    withCustomer: enquiries.filter((e) => e.status === 'quoted').length,
    toDeliver: orders.filter((o) => DELIVERY_STAGES.includes(o.status)).length,
    completed: orders.filter((o) => o.status === 'completed').length,
  };
}

/** Short Indian-style amounts for tiles: ₹950, ₹12.5K, ₹4.2L, ₹1.3Cr. */
export function compactINR(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
  if (a >= 1e7) return `${sign}₹${fmt(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${fmt(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${fmt(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}
