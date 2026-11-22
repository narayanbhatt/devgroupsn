import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { IMAGE_BUCKET } from '@/data/catalogue';
import { fitWithin } from '@/data/product-form';
import { base64ToBytes } from '@/lib/base64';
import { supabase } from '@/lib/supabase';

const MAX_PHOTOS = 8;

/**
 * Lets a catalogue admin pick photos from the phone, shrinks each to at most 1600px
 * as a JPEG (most phone photos drop from ~4 MB to ~300 KB), uploads them to storage
 * and records them on the product. Returns how many were added.
 */
export async function addProductPhotos(productId: string, existingCount: number, productName: string): Promise<number> {
  const db = supabase;
  if (!db) throw new Error('Photo upload needs the app to be connected to the server.');
  const room = MAX_PHOTOS - existingCount;
  if (room <= 0) throw new Error(`A product can have up to ${MAX_PHOTOS} photos. Remove one first.`);

  // Android's photo picker needs no storage permission.
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: room,
    quality: 1,
  });
  if (picked.canceled) return 0;

  let added = 0;
  for (const asset of picked.assets.slice(0, room)) {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const size = fitWithin(asset.width, asset.height);
    if (size) ctx.resize(size);
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    if (!saved.base64) throw new Error('Could not read the photo.');

    const path = `products/${productId}/${Date.now()}-${added}.jpg`;
    const { error: upErr } = await db.storage
      .from(IMAGE_BUCKET)
      .upload(path, base64ToBytes(saved.base64), { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { error: rowErr } = await db.from('product_images').insert({
      product_id: productId,
      storage_path: path,
      alt: productName,
      sort_order: existingCount + added,
    });
    if (rowErr) {
      await db.storage.from(IMAGE_BUCKET).remove([path]);
      throw new Error('The photo uploaded but could not be attached to the product.');
    }
    added++;
  }
  return added;
}

export async function removeProductPhoto(imageId: string, path: string): Promise<void> {
  const db = supabase;
  if (!db) return;
  const { error } = await db.from('product_images').delete().eq('id', imageId);
  if (error) throw new Error('Could not remove the photo.');
  // The row is what customers see; a leftover file is harmless if this fails.
  await db.storage.from(IMAGE_BUCKET).remove([path]);
}

/** Makes the chosen photo the first (hero) photo, keeping the others in order. */
export async function makeCoverPhoto(images: { id: string }[], coverId: string): Promise<void> {
  const db = supabase;
  if (!db) return;
  const ordered = [coverId, ...images.map((i) => i.id).filter((id) => id !== coverId)];
  const results = await Promise.all(
    ordered.map((id, sort_order) => db.from('product_images').update({ sort_order }).eq('id', id)),
  );
  if (results.some((r) => r.error)) throw new Error('Could not reorder the photos.');
}
