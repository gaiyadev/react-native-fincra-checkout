import type { FincraPaymentResponse } from '../types';
import { UrlHandler } from '../utils/UrlHandler';

// ─── JS Bridge ────────────────────────────────────────────────────────────────
//
// Direct TypeScript port of flutter_fincra_checkout/lib/src/inline/javascript_bridge.dart
// Handles parsing of postMessage events from the Fincra inline JS SDK.

/** Events that can be posted from the Fincra inline JavaScript SDK. */
export enum FincraBridgeEvent {
  /** The Fincra SDK has loaded and is ready — hide the loader. */
  Ready = 'ready',
  /** Payment completed successfully. */
  Success = 'success',
  /** The user closed the Fincra checkout modal. */
  Closed = 'closed',
  /** The Fincra SDK emitted an error (e.g., load failure). */
  Error = 'error',
  /** Unrecognized or malformed event — should be ignored. */
  Unknown = 'unknown',
}

/** A parsed message posted by the Fincra JS SDK via `postMessage`. */
export interface FincraBridgeMessage {
  event: FincraBridgeEvent;
  /**
   * Always populated for `success` events; populated for `error` events
   * that carry a data object.
   */
  data?: FincraPaymentResponse | { message: string };
}

/**
 * Parses a raw `postMessage` JSON string into a `FincraBridgeMessage`.
 *
 * Expected format from the HTML template:
 * ```json
 * { "event": "success", "data": { "reference": "...", ... } }
 * ```
 *
 * On any parse failure, returns an `Unknown` event (mirrors Flutter's catch block).
 */
export function parseMessage(jsonString: string): FincraBridgeMessage {
  try {
    const map = JSON.parse(jsonString) as Record<string, unknown>;
    // Guard: JSON.parse('null') returns null, not an object
    if (map == null || typeof map !== 'object') {
      return { event: FincraBridgeEvent.Unknown };
    }

    const eventStr = typeof map['event'] === 'string' ? map['event'] : null;
    const event = _parseEvent(eventStr);

    if (event === FincraBridgeEvent.Success) {
      // A success event is always a success — even with missing/malformed
      // data (empty references), so a real payment is never hidden.
      const rawData = map['data'];
      const params =
        rawData != null && typeof rawData === 'object' && !Array.isArray(rawData)
          ? normalizeSuccessData(rawData as Record<string, unknown>)
          : {};
      if (!params['status']) params['status'] = 'success';
      return { event, data: UrlHandler.parsePaymentResponse(params) };
    }

    if (
      event === FincraBridgeEvent.Error &&
      map['data'] != null &&
      typeof map['data'] === 'object' &&
      !Array.isArray(map['data'])
    ) {
      const dataMap = map['data'] as Record<string, unknown>;
      const errorMessage =
        typeof dataMap['message'] === 'string'
          ? dataMap['message']
          : 'An unknown error occurred';
      return { event, data: { message: errorMessage } };
    }

    return { event };
  } catch {
    return { event: FincraBridgeEvent.Unknown };
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Converts success data to a string map: objects/arrays are JSON-encoded,
 * other values stringified, and `null`/`undefined` values dropped.
 */
function normalizeSuccessData(
  data: Record<string, unknown>
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    params[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return params;
}

function _parseEvent(eventStr: string | null): FincraBridgeEvent {
  switch (eventStr) {
    case 'ready':
      return FincraBridgeEvent.Ready;
    case 'success':
      return FincraBridgeEvent.Success;
    case 'closed':
      return FincraBridgeEvent.Closed;
    case 'error':
      return FincraBridgeEvent.Error;
    default:
      return FincraBridgeEvent.Unknown;
  }
}
