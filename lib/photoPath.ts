// Pure photo path/naming logic (NWE-204). Kept separate from the expo I/O so it's
// unit-testable without a device. A stored photo is referenced by its FILENAME
// only (never a full path or URL) — the file lives in the app's private photo dir,
// and the filename is meaningless off-device (product promise: photos never leave).

/** Generate a unique photo filename. */
export function makePhotoFilename(now: number = Date.now(), rand: string = randomSuffix()): string {
  return `meal-${now}-${rand}.jpg`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Is this a filename we generated (not a path, not a URL)? Guards bad input. */
export function isValidPhotoFilename(name: string): boolean {
  return /^meal-\d+-[a-z0-9]+\.jpg$/.test(name);
}

/** Join the photo dir and a filename into a full local URI. */
export function photoUri(dir: string, filename: string): string {
  return `${dir}${filename}`;
}
