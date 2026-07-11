// On-device photo storage (NWE-204). Photos live ONLY in the app's private
// documents dir and are NEVER uploaded — "your photos are never stored" server-side.
// Capture/pick → save under photos/ → reference by FILENAME only. The pure
// path/naming logic is in lib/photoPath.ts (unit-tested); this file is the I/O.
//
// SDK 57 moved the file helpers to the legacy entry; the modern Paths/File API can
// be adopted later. Legacy is stable and documented.
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { makePhotoFilename, photoUri } from '@/lib/photoPath';

export const PHOTO_DIR = `${FileSystem.documentDirectory ?? ''}photos/`;
const PROGRESS_MANIFEST_KEY = 'nwe.progressPhotos.v1';

export interface ProgressPhoto {
  filename: string;
  logged_on: string;
}

export function parseProgressManifest(raw: string | null): ProgressPhoto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ProgressPhoto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addToProgressManifest(items: ProgressPhoto[], photo: ProgressPhoto): ProgressPhoto[] {
  return [photo, ...items];
}

export function removeFromProgressManifest(items: ProgressPhoto[], filename: string): ProgressPhoto[] {
  return items.filter((item) => item.filename !== filename);
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
}

/** Full local URI for a stored photo filename (or null). */
export function localPhotoUri(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return photoUri(PHOTO_DIR, filename);
}

/** Does the photo file exist on THIS device? (thumbnails only render if so.) */
export async function photoExists(filename: string | null | undefined): Promise<boolean> {
  const uri = localPhotoUri(filename);
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/** Copy a picked/captured image into the private photo dir; returns the filename. */
async function persist(uri: string): Promise<string> {
  await ensureDir();
  const filename = makePhotoFilename();
  await FileSystem.copyAsync({ from: uri, to: photoUri(PHOTO_DIR, filename) });
  return filename;
}

/** Launch the camera; returns the saved filename or null if cancelled/denied. */
export async function capturePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
  if (res.canceled || !res.assets?.[0]) return null;
  return persist(res.assets[0].uri);
}

/** Pick from the library; returns the saved filename or null if cancelled/denied. */
export async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: false });
  if (res.canceled || !res.assets?.[0]) return null;
  return persist(res.assets[0].uri);
}

/** Delete a single stored photo. Safe if it's already gone. */
export async function deletePhoto(filename: string | null | undefined): Promise<void> {
  const uri = localPhotoUri(filename);
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort.
  }
}

export async function listProgressPhotos(): Promise<ProgressPhoto[]> {
  const raw = await AsyncStorage.getItem(PROGRESS_MANIFEST_KEY);
  return parseProgressManifest(raw);
}

async function saveProgressManifest(items: ProgressPhoto[]): Promise<void> {
  await AsyncStorage.setItem(PROGRESS_MANIFEST_KEY, JSON.stringify(items));
}

export async function addProgressPhoto(from: 'camera' | 'library'): Promise<ProgressPhoto | null> {
  const filename = from === 'camera' ? await capturePhoto() : await pickPhoto();
  if (!filename) return null;
  const photo = { filename, logged_on: new Date().toISOString().slice(0, 10) };
  const items = await listProgressPhotos();
  await saveProgressManifest(addToProgressManifest(items, photo));
  return photo;
}

export async function removeProgressPhoto(filename: string): Promise<void> {
  await deletePhoto(filename);
  const items = await listProgressPhotos();
  await saveProgressManifest(removeFromProgressManifest(items, filename));
}

/** Delete every locally-stored photo (used on account deletion, NWE-117). */
export async function wipeAllLocalPhotos(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(PHOTO_DIR);
    if (info.exists) await FileSystem.deleteAsync(PHOTO_DIR, { idempotent: true });
  } catch {
    // Best-effort.
  }
}
