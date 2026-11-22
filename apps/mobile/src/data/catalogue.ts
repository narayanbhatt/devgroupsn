import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type PricingType = 'fixed' | 'starting_from' | 'quote';
export type ProductStatus = 'draft' | 'published' | 'archived' | 'temporarily_unavailable';

export const IMAGE_BUCKET = 'product-images';

export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductImage {
  id: string;
  path: string;
  url: string;
  alt: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  description: string;
  listedPrice: number | null;
  pricingType: PricingType;
  taxRate: number;
  taxNote: string;
  unit: string;
  status: ProductStatus;
  specifications: Record<string, string>;
  images: ProductImage[];
}

export interface Catalogue {
  categories: Category[];
  products: Product[];
  /** Set when the network failed and this is the copy saved on the phone. */
  offlineSince: string | null;
}

/** Customers can see and enquire about these; "temporarily unavailable" shows but can't be added. */
export const CUSTOMER_STATUSES: ProductStatus[] = ['published', 'temporarily_unavailable'];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  temporarily_unavailable: 'Temporarily unavailable',
  archived: 'Archived',
};

export const PRICING_LABEL: Record<PricingType, string> = {
  fixed: 'Fixed price',
  starting_from: 'Starting from',
  quote: 'On quotation',
};

/** Real DEV catalogue (design doc §3). Used as sample data until Supabase is configured. */
const cat = (slug: string, name: string, sortOrder: number): Category => ({
  id: slug,
  slug,
  name,
  sortOrder,
  isActive: true,
});
export const SAMPLE_CATEGORIES: Category[] = [
  cat('furniture', 'Furniture', 1),
  cat('sanitation', 'Sanitation', 2),
  cat('lighting', 'Lighting', 3),
  cat('solar', 'Solar', 4),
  cat('utility', 'Utility', 5),
  cat('services', 'Services', 6),
];

const p = (sku: string, name: string, categoryId: string, listedPrice: number, taxNote: string): Product => ({
  id: sku,
  sku,
  name,
  categoryId,
  description: '',
  listedPrice,
  pricingType: 'fixed',
  taxRate: 18,
  taxNote,
  unit: 'piece',
  status: 'published',
  specifications: {},
  images: [],
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

// --------------------------------------------------------------------------- rows

const PRODUCT_COLUMNS =
  'id, sku, name, category_id, description, listed_price, pricing_type, tax_rate, tax_note, unit, status, specifications, product_images(id, storage_path, alt, sort_order)';
const CATEGORY_COLUMNS = 'id, name, slug, sort_order, is_active';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

interface ImageRow {
  id: string;
  storage_path: string;
  alt: string | null;
  sort_order: number;
}

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  description: string | null;
  listed_price: number | string | null;
  pricing_type: PricingType;
  tax_rate: number | string;
  tax_note: string | null;
  unit: string;
  status: ProductStatus;
  specifications: Record<string, unknown> | null;
  product_images: ImageRow[] | null;
}

export function imageUrl(path: string): string {
  if (!supabase) return '';
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

const categoryFromRow = (r: CategoryRow): Category => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  sortOrder: r.sort_order,
  isActive: r.is_active,
});

export function productFromRow(r: ProductRow): Product {
  const specs: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.specifications ?? {})) {
    if (v != null && v !== '') specs[k] = String(v);
  }
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    categoryId: r.category_id,
    description: r.description ?? '',
    // Postgres numeric arrives as a string.
    listedPrice: r.listed_price == null ? null : Number(r.listed_price),
    pricingType: r.pricing_type,
    taxRate: Number(r.tax_rate),
    taxNote: r.tax_note ?? '',
    unit: r.unit,
    status: r.status,
    specifications: specs,
    images: (r.product_images ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ id: i.id, path: i.storage_path, url: imageUrl(i.storage_path), alt: i.alt ?? '', sortOrder: i.sort_order })),
  };
}

// --------------------------------------------------------------------------- customer catalogue

const CACHE_KEY = 'catalogue.v1';

interface CachedCatalogue {
  savedAt: string;
  categories: Category[];
  products: Product[];
}

async function readCache(): Promise<CachedCatalogue | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedCatalogue) : null;
  } catch {
    return null;
  }
}

async function writeCache(c: Omit<CachedCatalogue, 'savedAt'>) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, savedAt: new Date().toISOString() }));
  } catch {
    // A full disk only costs us the offline copy.
  }
}

/**
 * The catalogue customers browse (C03). Each successful load is saved on the phone,
 * so the catalogue still opens without a connection (§49).
 */
export async function fetchCatalogue(): Promise<Catalogue> {
  if (!isSupabaseConfigured || !supabase) {
    return { categories: SAMPLE_CATEGORIES, products: SAMPLE_PRODUCTS, offlineSince: null };
  }
  const [cats, prods] = await Promise.all([
    supabase.from('categories').select(CATEGORY_COLUMNS).eq('is_active', true).order('sort_order'),
    supabase.from('products').select(PRODUCT_COLUMNS).in('status', CUSTOMER_STATUSES).order('name'),
  ]);
  if (cats.error || prods.error) {
    const cached = await readCache();
    if (cached) return { categories: cached.categories, products: cached.products, offlineSince: cached.savedAt };
    throw new Error('Unable to load the catalogue. Check your connection and try again.');
  }
  const categories = (cats.data as CategoryRow[]).map(categoryFromRow);
  const products = (prods.data as ProductRow[]).map(productFromRow);
  await writeCache({ categories, products });
  return { categories, products, offlineSince: null };
}

/** One product for its detail page, plus up to four others from the same category. */
export async function fetchProductWithRelated(id: string): Promise<{ product: Product; related: Product[]; categoryName: string } | null> {
  const { products, categories } = await fetchCatalogue();
  let product = products.find((x) => x.id === id) ?? null;
  if (!product && isSupabaseConfigured && supabase) {
    // Not in the customer list: staff opening a draft or archived product.
    const { data } = await supabase.from('products').select(PRODUCT_COLUMNS).eq('id', id).maybeSingle();
    if (data) product = productFromRow(data as ProductRow);
  }
  if (!product) return null;
  const related = products.filter((x) => x.categoryId === product.categoryId && x.id !== product.id).slice(0, 4);
  const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? '';
  return { product, related, categoryName };
}

// --------------------------------------------------------------------------- staff catalogue

function requireDb() {
  if (!supabase) throw new Error('The catalogue editor needs the app to be connected to the server.');
  return supabase;
}

/** Every product, whatever its status (staff only; RLS enforces it). */
export async function fetchAllProducts(): Promise<Product[]> {
  const { data, error } = await requireDb().from('products').select(PRODUCT_COLUMNS).order('name');
  if (error) throw new Error('Unable to load products.');
  return (data as ProductRow[]).map(productFromRow);
}

/** Every category, including hidden ones (staff only). */
export async function fetchAllCategories(): Promise<Category[]> {
  const { data, error } = await requireDb().from('categories').select(CATEGORY_COLUMNS).order('sort_order');
  if (error) throw new Error('Unable to load categories.');
  return (data as CategoryRow[]).map(categoryFromRow);
}

export async function fetchProductForEdit(id: string): Promise<Product | null> {
  const { data, error } = await requireDb().from('products').select(PRODUCT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error('Unable to load product.');
  return data ? productFromRow(data as ProductRow) : null;
}
