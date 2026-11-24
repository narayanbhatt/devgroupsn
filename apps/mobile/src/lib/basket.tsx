import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Product } from '@/data/catalogue';

/** One product in the enquiry basket (§13). Prices here are indicative only. */
export interface BasketItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  listedPrice: number | null;
  taxNote: string;
  imageUrl: string | null;
  quantity: number;
  installationRequired: boolean;
  notes: string;
}

interface BasketState {
  items: BasketItem[];
  count: number;
  add: (p: Product, quantity: number) => void;
  update: (productId: string, change: Partial<Pick<BasketItem, 'quantity' | 'installationRequired' | 'notes'>>) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const KEY = 'enquiry-basket.v1';
const BasketContext = createContext<BasketState | null>(null);

/** The basket stays on the phone until the enquiry is sent, and survives restarts. */
export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setItems(JSON.parse(raw) as BasketItem[]);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => undefined);
  }, [items, loaded]);

  const add = useCallback((p: Product, quantity: number) => {
    setItems((list) => {
      const existing = list.find((i) => i.productId === p.id);
      if (existing) {
        return list.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [
        ...list,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          listedPrice: p.pricingType === 'quote' ? null : p.listedPrice,
          taxNote: p.taxNote,
          imageUrl: p.images[0]?.url ?? null,
          quantity,
          installationRequired: false,
          notes: '',
        },
      ];
    });
  }, []);

  const update = useCallback<BasketState['update']>((productId, change) => {
    setItems((list) => list.map((i) => (i.productId === productId ? { ...i, ...change } : i)));
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((list) => list.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, count: items.length, add, update, remove, clear }),
    [items, add, update, remove, clear],
  );
  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket() {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used inside BasketProvider');
  return ctx;
}
