import type { PricingType, ProductStatus } from '@/data/catalogue';

/** One editable specification row in the staff product editor. */
export interface SpecRow {
  key: string;
  value: string;
}

/** What the staff product editor holds while someone is typing. */
export interface ProductDraft {
  name: string;
  sku: string;
  categoryId: string;
  description: string;
  price: string;
  pricingType: PricingType;
  taxRate: string;
  taxNote: string;
  unit: string;
  status: ProductStatus;
  specs: SpecRow[];
}

export const EMPTY_DRAFT: ProductDraft = {
  name: '',
  sku: '',
  categoryId: '',
  description: '',
  price: '',
  pricingType: 'fixed',
  taxRate: '18',
  taxNote: '+ GST',
  unit: 'piece',
  status: 'draft',
  specs: [],
};

export function specsToRows(specs: Record<string, string>): SpecRow[] {
  return Object.entries(specs).map(([key, value]) => ({ key, value: String(value) }));
}

/** Blank rows are dropped; a later row with the same name wins. */
export function rowsToSpecs(rows: SpecRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const key = r.key.trim();
    const value = r.value.trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/** The database row the draft becomes, or the first problem to fix. */
export type DraftResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

export function draftToRow(d: ProductDraft): DraftResult {
  const name = d.name.trim();
  const sku = d.sku.trim().toUpperCase();
  if (!name) return { ok: false, error: 'Enter a product name.' };
  if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(sku)) {
    return { ok: false, error: 'SKU: 2 to 40 letters, digits or dashes, like LGT-STREET-45W.' };
  }
  if (!d.categoryId) return { ok: false, error: 'Choose a category.' };

  let listedPrice: number | null = null;
  if (d.pricingType !== 'quote') {
    const price = Number(d.price.replace(/[,\s₹]/g, ''));
    if (!d.price.trim() || !Number.isFinite(price) || price < 0) {
      return { ok: false, error: 'Enter the listed price in rupees, or choose "On quotation".' };
    }
    listedPrice = Math.round(price * 100) / 100;
  }

  const taxRate = Number(d.taxRate);
  if (!d.taxRate.trim() || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { ok: false, error: 'Tax rate must be a percentage from 0 to 100.' };
  }

  return {
    ok: true,
    row: {
      name,
      sku,
      category_id: d.categoryId,
      description: d.description.trim() || null,
      listed_price: listedPrice,
      pricing_type: d.pricingType,
      tax_rate: taxRate,
      tax_note: d.taxNote.trim() || null,
      unit: d.unit.trim() || 'piece',
      status: d.status,
      specifications: rowsToSpecs(d.specs),
    },
  };
}

/** Turns a category name into its URL-safe slug, e.g. "Street Lights" -> "street-lights". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Longest side capped at `max`, keeping the aspect ratio. Null means no resize is needed. */
export function fitWithin(width: number, height: number, max = 1600): { width: number } | { height: number } | null {
  if (width <= max && height <= max) return null;
  return width >= height ? { width: max } : { height: max };
}
