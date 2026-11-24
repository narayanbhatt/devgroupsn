import type { DocumentType, OrderPaymentStatus, OrderStatus, PaymentMethod, PaymentState } from '@/data/order-rules';
import { supabase } from '@/lib/supabase';

export interface OrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  grandTotal: number;
  paidAmount: number;
  projectName: string | null;
  createdAt: string;
  customerName: string | null;
  organizationName: string | null;
}

export interface OrderItem {
  id: string;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
  lineTax: number;
}

export interface OrderEvent {
  id: string;
  event: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  note: string | null;
  internal: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber: string | null;
  paymentDate: string;
  status: PaymentState;
  proofDocumentId: string | null;
  notes: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface DocumentFile {
  id: string;
  ownerType: 'enquiry' | 'order';
  ownerId: string;
  type: DocumentType;
  filename: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  visibleToCustomer: boolean;
  createdAt: string;
}

export interface Order extends OrderSummary {
  enquiryId: string;
  quotationId: string;
  customerId: string;
  customerEmail: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  delivery: number;
  installation: number;
  otherCharges: number;
  terms: string | null;
  projectLocation: string | null;
  deliveryAddress: string | null;
  expectedDelivery: string | null;
  items: OrderItem[];
  events: OrderEvent[];
  payments: Payment[];
  documents: DocumentFile[];
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

function db() {
  if (!supabase) throw new Error('Orders need the app to be connected to the server.');
  return supabase;
}

const SUMMARY_COLUMNS =
  'id, order_number, status, payment_status, grand_total, paid_amount, project_name, created_at, customer:profiles!orders_customer_id_fkey(full_name), organization:organizations(name)';

const summaryFrom = (r: any): OrderSummary => ({
  id: r.id,
  number: r.order_number,
  status: r.status,
  paymentStatus: r.payment_status,
  grandTotal: num(r.grand_total),
  paidAmount: num(r.paid_amount),
  projectName: r.project_name,
  createdAt: r.created_at,
  customerName: r.customer?.full_name ?? null,
  organizationName: r.organization?.name ?? null,
});

export const documentFrom = (d: any): DocumentFile => ({
  id: d.id,
  ownerType: d.owner_type,
  ownerId: d.owner_id,
  type: d.document_type,
  filename: d.filename,
  path: d.storage_path,
  mimeType: d.mime_type,
  sizeBytes: d.size_bytes,
  visibleToCustomer: d.visible_to_customer,
  createdAt: d.created_at,
});

/** The signed-in customer's orders (RLS adds their organization's). */
export async function fetchMyOrders(): Promise<OrderSummary[]> {
  const { data, error } = await db().from('orders').select(SUMMARY_COLUMNS).order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load your orders.');
  return data.map(summaryFrom);
}

/** Every order, for staff. */
export async function fetchAllOrders(): Promise<OrderSummary[]> {
  const { data, error } = await db().from('orders').select(SUMMARY_COLUMNS).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error('Unable to load orders.');
  return data.map(summaryFrom);
}

/** Order that came from a quotation, if any. */
export async function fetchOrderIdForQuotation(quotationId: string): Promise<string | null> {
  const { data } = await db().from('orders').select('id').eq('quotation_id', quotationId).maybeSingle();
  return data?.id ?? null;
}

export async function fetchDocuments(ownerType: 'enquiry' | 'order', ownerId: string): Promise<DocumentFile[]> {
  const { data, error } = await db()
    .from('documents')
    .select('*')
    .eq('owner_type', ownerType)
    .eq('owner_id', ownerId)
    .order('created_at');
  if (error) throw new Error('Unable to load files.');
  return data.map(documentFrom);
}

export async function fetchOrder(id: string): Promise<Order | null> {
  const [{ data: r, error }, docs] = await Promise.all([
    db()
      .from('orders')
      .select(
        `*, customer:profiles!orders_customer_id_fkey(full_name, email), organization:organizations(name),
         order_items(*), order_events(*), payments(*)`,
      )
      .eq('id', id)
      .maybeSingle(),
    fetchDocuments('order', id),
  ]);
  if (error) throw new Error('Unable to load this order.');
  if (!r) return null;
  return {
    ...summaryFrom(r),
    enquiryId: r.enquiry_id,
    quotationId: r.quotation_id,
    customerId: r.customer_id,
    customerEmail: r.customer?.email ?? null,
    subtotal: num(r.subtotal),
    tax: num(r.tax),
    discount: num(r.discount),
    delivery: num(r.delivery),
    installation: num(r.installation),
    otherCharges: num(r.other_charges),
    terms: r.terms,
    projectLocation: r.project_location,
    deliveryAddress: r.delivery_address,
    expectedDelivery: r.expected_delivery,
    items: r.order_items
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((i: any) => ({
        id: i.id,
        description: i.description,
        sku: i.sku,
        unit: i.unit,
        quantity: num(i.quantity),
        unitPrice: num(i.unit_price),
        taxRate: num(i.tax_rate),
        lineTotal: num(i.line_total),
        lineTax: num(i.line_tax),
      })),
    events: r.order_events
      .map((e: any) => ({
        id: e.id,
        event: e.event,
        fromStatus: e.from_status,
        toStatus: e.to_status,
        note: e.note,
        internal: e.internal,
        createdAt: e.created_at,
      }))
      .sort((a: OrderEvent, b: OrderEvent) => a.createdAt.localeCompare(b.createdAt)),
    payments: r.payments
      .map((p: any) => ({
        id: p.id,
        amount: num(p.amount),
        method: p.method,
        referenceNumber: p.reference_number,
        paymentDate: p.payment_date,
        status: p.status,
        proofDocumentId: p.proof_document_id,
        notes: p.notes,
        reviewNote: p.review_note,
        createdAt: p.created_at,
      }))
      .sort((a: Payment, b: Payment) => b.createdAt.localeCompare(a.createdAt)),
    documents: docs,
  };
}
