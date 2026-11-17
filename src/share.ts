import { normalizeRecorded, sameTriple } from './recorded';
import type { RecordedPotion } from './state';

/**
 * Export/import codec.
 *
 * A saved potion list is serialized to JSON, encoded as UTF-8, then base64
 * encoded. The JSON carries a format marker and a version so foreign or
 * outdated codes can be rejected with a useful message instead of corrupting
 * the recorded list.
 */

const SHARE_APP = 'potion-class-solver';
const SHARE_VERSION = 1;

/** Guards against pathological pastes before attempting to decode them. */
const MAX_CODE_LENGTH = 1024 * 1024;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder('utf-8', { fatal: true });

export type DecodeRecordedResult =
  | { ok: true; recorded: RecordedPotion[]; skipped: number }
  | { ok: false; error: string };

/** Encodes the recorded list as a shareable base64 string. */
export function encodeRecorded(recorded: readonly RecordedPotion[]): string {
  const payload = {
    app: SHARE_APP,
    version: SHARE_VERSION,
    recorded: recorded.map(rec => ({
      reagents: rec.reagents,
      outcome: rec.outcome,
    })),
  };
  return bytesToBase64(ENCODER.encode(JSON.stringify(payload)));
}

/**
 * Decodes a base64 export code. Valid entries whose reagent triple repeats an
 * earlier entry are skipped and counted in `skipped`.
 */
export function decodeRecorded(code: string): DecodeRecordedResult {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste an export code first.' };
  }
  if (trimmed.length > MAX_CODE_LENGTH) {
    return { ok: false, error: 'That code is too large to be a valid potion export.' };
  }

  let json: string;
  try {
    json = DECODER.decode(base64ToBytes(trimmed));
  } catch {
    return { ok: false, error: 'That does not look like a valid base64 export code.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The code is base64, but it does not contain a valid export.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'The code does not contain a potion export.' };
  }

  const payload = parsed as Record<string, unknown>;
  if (payload.app !== SHARE_APP) {
    return { ok: false, error: 'That code was not created by this app.' };
  }
  if (payload.version !== SHARE_VERSION) {
    return { ok: false, error: `Unsupported export version (expected ${SHARE_VERSION}).` };
  }
  if (!Array.isArray(payload.recorded)) {
    return { ok: false, error: 'The export is missing its recorded potions.' };
  }
  const rawRecorded = payload.recorded;
  if (rawRecorded.length === 0) {
    return { ok: false, error: 'That export does not contain any recorded potions.' };
  }

  const recorded: RecordedPotion[] = [];
  let skipped = 0;
  for (const item of rawRecorded) {
    const entry = normalizeRecorded(item);
    if (!entry || recorded.some(existing => sameTriple(existing.reagents, entry.reagents))) {
      skipped += 1;
      continue;
    }
    recorded.push(entry);
  }
  if (recorded.length === 0) {
    return { ok: false, error: 'That export does not contain any valid recorded potions.' };
  }
  return { ok: true, recorded, skipped };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(code: string): Uint8Array {
  // Tolerate whitespace and the URL-safe alphabet; exports always use standard base64.
  const normalized = code.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  if (remainder === 1) {
    throw new Error('Invalid base64 length');
  }
  const padded = normalized + '='.repeat((4 - remainder) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
