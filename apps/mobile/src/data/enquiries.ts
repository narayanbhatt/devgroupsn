import type { EnquiryStatus, QuotationStatus } from '@/data/commercial';
import { fetchDocuments, type DocumentFile } from '@/data/orders';
import { supabase } from '@/lib/supabase';

export interface EnquiryItem {
  id: string;
  productId: string | null;
  productName: string;
  sku: string | null;
  unit: string;
  listedPrice: number | null;
  quantity: number;
  installationRequired: boolean;
  notes: string | null;
}

export interface QuotationItem {
  id: string;
  productId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
  lineTax: number;
  sortOrder: number;
}

export interface Quotation {
  id: string;
  number: string;
  version: number;
  enquiryId: string;
  status: QuotationStatus;
  validUntil: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  delivery: number;
  installation: number;
  otherCharges: number;
  grandTotal: number;
  terms: string | null;
  notes: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  responseNote: string | null;
  items: QuotationItem[];
}

export interface CommercialEvent {
  id: string;
  event: string;
  note: string | null;
  createdAt: string;
  quotationId: string | null;
}

export interface EnquirySummary {
  id: string;
  number: string;
  status: EnquiryStatus;
  projectName: string | null;
  submittedAt: string;
  itemCount: number;
  customerName: string | null;
  organizationName: string | null;
}

export interface Enquiry extends EnquirySummary {
  customerId: string;
  customerEmail: string | null;
  customerType: string | null;
  contactPerson: string;
  phone: string;
  email: string | null;
  projectLocation: string | null;
  requiredBy: string | null;
  requirements: string | null;
  notes: string | null;
  department: string | null;
  designation: string | null;
  procurementReference: string | null;
  poRequired: boolean;
  deliveryAddress: string | null;
  items: EnquiryItem[];
  quotations: Quotation[];
  events: CommercialEvent[];
  documents: DocumentFile[];
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

function db() {
  if (!supabase) throw new Error('Enquiries need the app to be connected to the server.');
  return supabase;
}

const summaryFrom = (r: any): EnquirySummary => ({
  id: r.id,
  number: r.enquiry_number,
  status: r.status,
  projectName: r.project_name,
  submittedAt: r.submitted_at,
  itemCount: r.enquiry_items?.[0]?.count ?? 0,
  customerName: r.customer?.full_name ?? null,
  organizationName: r.organization?.name ?? null,
});

export const quotationFrom = (r: any): Quotation => ({
  id: r.id,
  number: r.quotation_number,
  version: r.version,
  enquiryId: r.enquiry_id,
  status: r.status,
  validUntil: r.valid_until,
  subtotal: num(r.subtotal),
  tax: num(r.tax),
  discount: num(r.discount),
  delivery: num(r.delivery),
  installation: num(r.installation),
  otherCharges: num(r.other_charges),
  grandTotal: num(r.grand_total),
  terms: r.terms,
  notes: r.notes,
  sentAt: r.sent_at,
  respondedAt: r.responded_at,
  responseNote: r.response_note,
  items: (r.quotation_items ?? [])
    .map(
      (i: any): QuotationItem => ({
        id: i.id,
        productId: i.product_id,
        description: i.description,
        sku: i.sku,
        unit: i.unit,
        quantity: num(i.quantity),
        unitPrice: num(i.unit_price),
        taxRate: num(i.tax_rate),
        lineTotal: num(i.line_total),
        lineTax: num(i.line_tax),
        sortOrder: i.sort_order,
      }),
    )
    .sort((a: QuotationItem, b: QuotationItem) => a.sortOrder - b.sortOrder),
});

const SUMMARY_COLUMNS =
  'id, enquiry_number, status, project_name, submitted_at, enquiry_items(count), customer:profiles!enquiries_customer_id_fkey(full_name), organization:organizations(name)';
export const QUOTATION_COLUMNS = '*, quotation_items(*)';

/** The signed-in customer's enquiries, newest first (RLS limits them to their own and their organization's). */
export async function fetchMyEnquiries(userId: string): Promise<EnquirySummary[]> {
  const { data, error } = await db()
    .from('enquiries')
    .select(SUMMARY_COLUMNS)
    .eq('customer_id', userId)
    .order('submitted_at', { ascending: false });
  if (error) throw new Error('Unable to load your enquiries.');
  return data.map(summaryFrom);
}

/** Every enquiry, for staff. */
export async function fetchAllEnquiries(): Promise<EnquirySummary[]> {
  const { data, error } = await db().from('enquiries').select(SUMMARY_COLUMNS).order('submitted_at', { ascending: false }).limit(500);
  if (error) throw new Error('Unable to load enquiries.');
  return data.map(summaryFrom);
}

export async function fetchEnquiry(id: string): Promise<Enquiry | null> {
  const [{ data: r, error }, documents] = await Promise.all([
    db()
      .from('enquiries')
      .select(
        `*, enquiry_items(*), customer:profiles!enquiries_customer_id_fkey(full_name, email, customer_type), organization:organizations(name),
         address:addresses(label, line1, line2, city, state, pincode),
         quotations(${QUOTATION_COLUMNS}), commercial_events(id, event, note, created_at, quotation_id)`,
      )
      .eq('id', id)
      .maybeSingle(),
    fetchDocuments('enquiry', id),
  ]);
  if (error) throw new Error('Unable to load this enquiry.');
  if (!r) return null;
  const a = r.address;
  return {
    ...summaryFrom({ ...r, enquiry_items: [{ count: r.enquiry_items.length }] }),
    customerId: r.customer_id,
    customerEmail: r.customer?.email ?? null,
    customerType: r.customer?.customer_type ?? null,
    contactPerson: r.contact_person,
    phone: r.phone,
    email: r.email,
    projectLocation: r.project_location,
    requiredBy: r.required_by,
    requirements: r.requirements,
    notes: r.notes,
    department: r.department,
    designation: r.designation,
    procurementReference: r.procurement_reference,
    poRequired: r.po_required,
    deliveryAddress: a ? [a.label, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(', ') : null,
    items: r.enquiry_items
      .slice()
      .sort((x: { sort_order: number }, y: { sort_order: number }) => x.sort_order - y.sort_order)
      .map((i: Record<string, unknown>) => ({
        id: i.id as string,
        productId: i.product_id as string | null,
        productName: i.product_name as string,
        sku: i.sku as string | null,
        unit: i.unit as string,
        listedPrice: i.listed_price == null ? null : Number(i.listed_price),
        quantity: Number(i.quantity),
        installationRequired: i.installation_required as boolean,
        notes: i.notes as string | null,
      })),
    quotations: r.quotations.map(quotationFrom).sort((x: Quotation, y: Quotation) => y.version - x.version),
    events: r.commercial_events
      .map((e: Record<string, unknown>) => ({
        id: e.id as string,
        event: e.event as string,
        note: e.note as string | null,
        createdAt: e.created_at as string,
        quotationId: e.quotation_id as string | null,
      }))
      .sort((x: CommercialEvent, y: CommercialEvent) => x.createdAt.localeCompare(y.createdAt)),
    documents,
  };
}

export async function fetchQuotation(id: string): Promise<Quotation | null> {
  const { data, error } = await db().from('quotations').select(QUOTATION_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error('Unable to load this quotation.');
  return data ? quotationFrom(data) : null;
}

/** Customer-facing wording for the timeline. */
export const EVENT_LABEL: Record<string, string> = {
  ENQUIRY_SUBMITTED: 'Enquiry sent',
  ENQUIRY_UNDER_REVIEW: 'Under review',
  ENQUIRY_REQUIREMENT_CLARIFICATION: 'More details requested',
  ENQUIRY_QUOTE_PREPARATION: 'Quotation in preparation',
  ENQUIRY_REJECTED: 'Enquiry closed',
  ENQUIRY_CANCELLED: 'Enquiry cancelled',
  QUOTATION_CREATED: 'Quotation started',
  VERSION_CREATED: 'Revised quotation started',
  SENT: 'Quotation sent',
  VIEWED: 'Quotation opened',
  REVISION_REQUESTED: 'Revision requested',
  APPROVED: 'Quotation approved',
  REJECTED: 'Quotation declined',
  EXPIRED: 'Quotation expired',
  CONVERTED_TO_ORDER: 'Order placed',
};
