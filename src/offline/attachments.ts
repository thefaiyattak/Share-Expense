import * as FileSystem from 'expo-file-system/legacy';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory || ''}attachments/`;

/**
 * Ensures the persistent attachments directory exists.
 */
async function ensureDirectoryExists(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn('[attachments] Failed to create attachments directory:', err);
  }
}

/**
 * Copies a temporary picker image to permanent app storage.
 * Returns the permanent local file URI.
 */
export async function persistAttachment(sourceUri: string): Promise<string> {
  if (!sourceUri) return '';
  // If already in permanent attachments directory or is a remote http(s) URL, keep it
  if (sourceUri.includes('/attachments/') || sourceUri.startsWith('http://') || sourceUri.startsWith('https://')) {
    return sourceUri;
  }

  await ensureDirectoryExists();
  const extMatch = sourceUri.match(/\.([a-zA-Z0-9]+)(\?|$)/);
  const ext = extMatch ? extMatch[1] : 'jpg';
  const destUri = `${ATTACHMENTS_DIR}attach_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    // Clean up temporary image picker / cache file to free device storage
    if (sourceUri.includes('/ImagePicker/') || sourceUri.includes('/cache/')) {
      FileSystem.deleteAsync(sourceUri, { idempotent: true }).catch(() => {});
    }
    return destUri;
  } catch (err) {
    console.warn('[attachments] copyAsync failed, falling back to sourceUri:', err);
    return sourceUri;
  }
}

/**
 * Deletes a local attachment if it exists.
 */
export async function deleteLocalAttachment(uri?: string | null): Promise<void> {
  if (!uri || !uri.startsWith('file://')) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (err) {
    console.warn('[attachments] deleteAsync failed:', err);
  }
}

/**
 * Resolves the display URI for an entity image:
 * prefers local permanent URI, falls back to remote URL.
 */
export function resolveDisplayImage(localUri?: string | null, remoteUrl?: string | null): string | null {
  if (localUri) return localUri;
  if (remoteUrl) return remoteUrl;
  return null;
}

/**
 * Helper to upload a local file to Firebase Storage with retry support.
 */
export async function uploadBlobToFirebaseStorage(localUri: string, storagePath: string): Promise<string> {
  const storageRef = ref(storage, storagePath);

  let blob: Blob;
  try {
    const response = await fetch(localUri);
    blob = await response.blob();
  } catch {
    blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = (e) => reject(e);
      xhr.responseType = 'blob';
      xhr.open('GET', localUri, true);
      xhr.send(null);
    });
  }

  if (!blob) {
    throw new Error('Failed to create Blob from local attachment URI');
  }

  const contentType = blob.type || (storagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  await uploadBytes(storageRef, blob, { contentType });
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}
