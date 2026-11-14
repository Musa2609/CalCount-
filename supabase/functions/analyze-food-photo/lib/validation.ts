import { HttpError } from './errors.ts';
import {
  decodeImageBase64,
  sniffImageMime,
  stripDataUrlPrefix,
  type SupportedMimeType,
} from './image.ts';

/** Hard cap on the raw HTTP body, checked before JSON parsing. */
export const MAX_REQUEST_BYTES = 9 * 1024 * 1024;

export interface ValidatedImage {
  base64: string;
  mimeType: SupportedMimeType;
  byteLength: number;
}

/**
 * Validates the existing client contract `{ image, mimeType }`.
 *
 * The declared MIME type is only a hint: the decoded bytes are sniffed and the
 * detected type is authoritative, so a mislabelled or unsupported file is
 * rejected here rather than failing deep inside the vision call.
 */
export function validateAnalyzePayload(payload: unknown): ValidatedImage {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'invalid_request', 'The request body must be a JSON object.');
  }
  const record = payload as Record<string, unknown>;
  const rawImage = record.image;
  if (typeof rawImage !== 'string' || !rawImage.trim()) {
    throw new HttpError(400, 'invalid_request', 'The request is missing the "image" field.');
  }

  const { base64 } = stripDataUrlPrefix(rawImage);
  const bytes = decodeImageBase64(base64);
  const mimeType = sniffImageMime(bytes);
  if (!mimeType) {
    throw new HttpError(
      415,
      'unsupported_image',
      'That file is not a JPEG, PNG or WebP image. Try taking a new photo.',
    );
  }

  return { base64, mimeType, byteLength: bytes.length };
}
