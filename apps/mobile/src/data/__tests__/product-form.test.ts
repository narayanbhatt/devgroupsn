import { describe, expect, it } from '@jest/globals';

import { draftToRow, EMPTY_DRAFT, fitWithin, rowsToSpecs, slugify, specsToRows } from '@/data/product-form';
import { base64ToBytes } from '@/lib/base64';

const valid = { ...EMPTY_DRAFT, name: ' Street Light 45W ', sku: 'lgt-street-45w', categoryId: 'c1', price: '750' };

describe('draftToRow', () => {
  it('builds the database row', () => {
    const r = draftToRow({ ...valid, specs: [{ key: 'Wattage', value: '45 W' }, { key: ' ', value: 'x' }] });
    expect(r).toEqual({
      ok: true,
      row: expect.objectContaining({
        name: 'Street Light 45W',
        sku: 'LGT-STREET-45W',
        listed_price: 750,
        tax_rate: 18,
        status: 'draft',
        specifications: { Wattage: '45 W' },
      }),
    });
  });

  it('accepts prices written with commas or a rupee sign', () => {
    const r = draftToRow({ ...valid, price: '₹29,500' });
    expect(r.ok && r.row.listed_price).toBe(29500);
  });

  it('stores no price for "on quotation" products', () => {
    const r = draftToRow({ ...valid, pricingType: 'quote', price: '' });
    expect(r.ok && r.row.listed_price).toBeNull();
  });

  it('explains the first problem', () => {
    expect(draftToRow({ ...valid, name: '' })).toEqual({ ok: false, error: 'Enter a product name.' });
    expect(draftToRow({ ...valid, sku: 'bad sku!' }).ok).toBe(false);
    expect(draftToRow({ ...valid, categoryId: '' }).ok).toBe(false);
    expect(draftToRow({ ...valid, price: 'abc' }).ok).toBe(false);
    expect(draftToRow({ ...valid, price: '-1' }).ok).toBe(false);
    expect(draftToRow({ ...valid, taxRate: '120' }).ok).toBe(false);
  });
});

describe('specifications', () => {
  it('round-trips', () => {
    const specs = { Wattage: '45 W', Height: '6 m' };
    expect(rowsToSpecs(specsToRows(specs))).toEqual(specs);
  });
});

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Street Lights & Poles ')).toBe('street-lights-and-poles');
    expect(slugify('!!!')).toBe('');
  });
});

describe('fitWithin', () => {
  it('caps the longest side', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600 });
    expect(fitWithin(3000, 4000)).toEqual({ height: 1600 });
    expect(fitWithin(1200, 800)).toBeNull();
  });
});

describe('base64ToBytes', () => {
  it('decodes with and without padding', () => {
    expect(Array.from(base64ToBytes('TWFu'))).toEqual([77, 97, 110]);
    expect(Array.from(base64ToBytes('TWE='))).toEqual([77, 97]);
    expect(Array.from(base64ToBytes('TQ=='))).toEqual([77]);
    expect(Array.from(base64ToBytes('/9j/'))).toEqual([255, 216, 255]);
  });
});
