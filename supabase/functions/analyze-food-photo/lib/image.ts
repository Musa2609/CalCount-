import { HttpError } from './errors.ts';

/**
 * Image rules.
 *
 * The mobile app sends `{ image: <base64>, mimeType }`. We never trust either
 * field: the bytes are decoded, size-capped and sniffed, and the sniffed type
 * is what gets forwarded to the vision API.
 */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** 4/3 of the byte cap plus padding, so we can reject before decoding. */
export const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 16;

export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function stripDataUrlPrefix(value: string): { base64: string; declaredType: string | null } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(value);
  if (match) {
    return { base64: match[2].replace(/\s+/g, ''), declaredType: match[1].toLowerCase() };
  }
  return { base64: value.replace(/\s+/g, ''), declaredType: null };
}

export function decodeImageBase64(base64: string): Uint8Array {
  if (!base64) {
    throw new HttpError(400, 'invalid_image', 'The request did not include image data.');
  }
  if (base64.length > MAX_BASE64_CHARS) {
    throw new HttpError(
      413,
      'payload_too_large',
      'That photo is too large. Try a smaller image (under 6 MB).',
    );
  }
  if (!BASE64_PATTERN.test(base64)) {
    throw new HttpError(400, 'invalid_image', 'The image data is not valid base64.');
  }
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new HttpError(400, 'invalid_image', 'The image data is not valid base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.length === 0) {
    throw new HttpError(400, 'invalid_image', 'The image data is empty.');
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new HttpError(
      413,
      'payload_too_large',
      'That photo is too large. Try a smaller image (under 6 MB).',
    );
  }
  return bytes;
}

/**
 * Reads the file signature. Returns null for anything the vision API cannot
 * accept (HEIC from some iOS pickers, GIF, random bytes), which lets us answer
 * with a clear message instead of an opaque upstream error.
 */
export function sniffImageMime(bytes: Uint8Array): SupportedMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
