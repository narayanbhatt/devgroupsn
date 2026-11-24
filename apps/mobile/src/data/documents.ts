import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';

import { ALLOWED_MIME, MAX_FILE_BYTES, safeFileName, type DocumentType } from '@/data/order-rules';
import { base64ToBytes } from '@/lib/base64';
import { supabase } from '@/lib/supabase';

export const DOCUMENT_BUCKET = 'documents';

export interface PickedFile {
  name: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

/** Lets the person choose a PDF or photo from the phone. Returns null if they back out. */
export async function pickFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ALLOWED_MIME, copyToCacheDirectory: true, base64: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const mimeType = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  if (!ALLOWED_MIME.includes(mimeType)) throw new Error('Choose a PDF or a photo (JPEG, PNG or WebP).');
  if (!a.base64) throw new Error('Could not read that file.');
  const bytes = base64ToBytes(a.base64);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('That file is over 10 MB. Choose a smaller one.');
  return { name: a.name, mimeType, size: bytes.length, bytes };
}

/**
 * Uploads a file into the enquiry's or order's folder and registers it.
 * Returns the new document's id.
 */
export async function uploadDocument(
  ownerType: 'enquiry' | 'order',
  ownerId: string,
  type: DocumentType,
  file: PickedFile,
  visibleToCustomer = true,
): Promise<string> {
  const db = supabase;
  if (!db) throw new Error('Files need the app to be connected to the server.');
  const path = `${ownerType}/${ownerId}/${Date.now()}-${safeFileName(file.name)}`;
  const up = await db.storage.from(DOCUMENT_BUCKET).upload(path, file.bytes, { contentType: file.mimeType, upsert: false });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
  const { data, error } = await db.rpc('add_document', {
    owner_type: ownerType,
    owner_id: ownerId,
    document_type: type,
    filename: file.name,
    storage_path: path,
    mime_type: file.mimeType,
    size_bytes: file.size,
    visible_to_customer: visibleToCustomer,
  });
  if (error) throw new Error(error.message || 'The file uploaded but could not be attached.');
  return data as string;
}

/** Opens a private file through a link that works for ten minutes. */
export async function openDocument(path: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw new Error('Could not open that file.');
  await Linking.openURL(data.signedUrl);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
