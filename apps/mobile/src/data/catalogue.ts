import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type PricingType = 'fixed' | 'starting_from' | 'quote';

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  description: string;
  listedPrice: number | null;
  pricingType: PricingType;
  taxNote: string;
}

/** Real DEV catalogue (design doc §3). Used as sample data until Supabase is configured. */
export const SAMPLE_CATEGORIES: Category[] = [
  { id: 'furniture', name: 'Furniture' },
  { id: 'sanitation', name: 'Sanitation' },
  { id: 'lighting', name: 'Lighting' },
  { id: 'solar', name: 'Solar' },
  { id: 'utility', name: 'Utility' },
  { id: 'services', name: 'Services' },
];

const p = (
  sku: string,
  name: string,
  categoryId: string,
  listedPrice: number,
  taxNote: string,
): Product => ({
  id: sku,
  sku,
  name,
  categoryId,
  description: '',
  listedPrice,
  pricingType: 'fixed',
  taxNote,
});

export const SAMPLE_PRODUCTS: Product[] = [
  p('FUR-RCC-BENCH', 'RCC Bench', 'furniture', 2200, '+ Tax'),
  p('FUR-SCHOOL-BENCH', 'School Bench', 'furniture', 2200, '+ Tax'),
  p('SAN-DUSTBIN', 'Dustbin', 'sanitation', 900, '+ GST'),
  p('SAN-FOGGER', 'Fogging Machine', 'sanitation', 17600, '+ Tax'),
  p('LGT-STREET-45W', 'Street Light 45W', 'lighting', 750, '+ GST'),
  p('LGT-HIGHMAST', 'High Mast Complete Set', 'lighting', 29500, '+ Tax'),
  p('LGT-DESIGNER-POLE', 'Designer Pole', 'lighting', 4500, '+ Tax'),
  p('SOL-COMPLETE-SET', 'Solar Complete Set', 'solar', 5500, '+ Tax'),
  p('UTL-HAND-CART', 'Hand Cart / Thela', 'utility', 2800, '+ Tax'),
  p('UTL-GRASS-CUTTER', 'Grass Cutter Machine', 'utility', 7400, '+ Tax'),
];

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  description: string | null;
  listed_price: number | null;
  pricing_type: PricingType;
  tax_note: string | null;
}

const fromRow = (r: ProductRow): Product => ({
  id: r.id,
  sku: r.sku,
  name: r.name,
  categoryId: r.category_id,
  description: r.description ?? '',
  listedPrice: r.listed_price,
  pricingType: r.pricing_type,
  taxNote: r.tax_note ?? '',
});

export async function fetchCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured || !supabase) return SAMPLE_CATEGORIES;
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('sort_order');
  if (error) throw new Error('Unable to load categories.');
  return data;
}

export async function fetchProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured || !supabase) return SAMPLE_PRODUCTS;
  const { data, error } = await supabase
    .from('products')
    .select('id, sku, name, category_id, description, listed_price, pricing_type, tax_note')
    .eq('status', 'published')
    .order('name');
  if (error) throw new Error('Unable to load catalogue.');
  return (data as ProductRow[]).map(fromRow);
}

export async function fetchProduct(id: string): Promise<Product | null> {
  if (!isSupabaseConfigured || !supabase) {
    return SAMPLE_PRODUCTS.find((x) => x.id === id) ?? null;
  }
  const { data, error } = await supabase
    .from('products')
    .select('id, sku, name, category_id, description, listed_price, pricing_type, tax_note')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Unable to load product.');
  return data ? fromRow(data as ProductRow) : null;
}
