import type { FincraPaymentResponse } from '../types';

// ─── URL Handler ──────────────────────────────────────────────────────────────
//
// Direct TypeScript port of flutter_fincra_checkout/lib/src/utils/url_handler.dart
// Mirrors UrlHandler.isCompletionUrl() and UrlHandler.extractResponseParams()

const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443' };

/**
 * Utilities for detecting Fincra payment completion URLs and
 * extracting normalized response parameters.
 */
export class UrlHandler {
  /**
   * Returns `true` if the given URL signals a Fincra payment completion.
   *
   * Logic (mirrors Flutter):
   * 1. If `expectedRedirectUrl` is provided, the URL must match it strictly —
   *    see {@link UrlHandler.matchesRedirectUrl}.
   * 2. Fallback: Fincra appends `status` (or `payment_status`) AND `reference` as query params.
   *
   * @param url - The URL being navigated to.
   * @param expectedRedirectUrl - The redirect URL you registered on your backend.
   */
  static isCompletionUrl(url: string, expectedRedirectUrl?: string): boolean {
    if (!url) return false;

    if (expectedRedirectUrl && expectedRedirectUrl.length > 0) {
      return UrlHandler.matchesRedirectUrl(url, expectedRedirectUrl);
    }

    // Fallback: detect via query parameters
    try {
      const params = UrlHandler._parseQueryParams(url);
      const hasStatus =
        params.has('status') || params.has('payment_status');
      const hasReference = params.has('reference');
      return hasStatus && hasReference;
    } catch {
      return false;
    }
  }

  /**
   * Strictly matches `url` against the expected redirect URL.
   *
   * - Scheme, host (case-insensitive) and port (default ports normalised) must be equal.
   * - The path must equal the expected path or continue it at a `/` boundary
   *   (trailing slashes ignored). An empty expected path matches any path.
   * - Query string and fragment are ignored.
   * - Falls back to `startsWith` only if the expected URL cannot be parsed.
   *
   * Prevents lookalike hosts such as `https://google.com.evil.io` matching
   * `https://google.com`.
   */
  static matchesRedirectUrl(url: string, expectedRedirectUrl: string): boolean {
    const expected = UrlHandler._parseUrl(expectedRedirectUrl);
    if (!expected) return url.startsWith(expectedRedirectUrl);

    const actual = UrlHandler._parseUrl(url);
    if (!actual) return false;

    if (
      actual.scheme !== expected.scheme ||
      actual.host !== expected.host ||
      actual.port !== expected.port
    ) {
      return false;
    }

    if (expected.path === '') return true;
    return (
      actual.path === expected.path ||
      actual.path.startsWith(`${expected.path}/`)
    );
  }

  /**
   * Reads the payment status from completion params, accepting either
   * `status` or `payment_status`. Returns lower-case.
   *
   * A missing status is treated as `'success'` because the sandbox redirect
   * omits it. **Always verify the payment on your backend** (Fincra API or
   * webhook) before fulfilling an order.
   */
  static extractStatus(params: Record<string, string>): string {
    const raw = params['status'] ?? params['payment_status'];
    return raw?.toLowerCase() ?? 'success';
  }

  /**
   * Extracts all query parameters from the URL as a `Record<string, string>`.
   *
   * @param url - The completion URL from Fincra.
   */
  static extractResponseParams(url: string): Record<string, string> {
    try {
      const params = UrlHandler._parseQueryParams(url);
      const result: Record<string, string> = {};
      params.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    } catch {
      return {};
    }
  }

  /**
   * Builds a normalized `FincraPaymentResponse` from URL query parameters.
   *
   * Mirrors `FincraPaymentResponse.fromUrlParams()` in Flutter, including
   * the reference normalization logic (customerReference → merchantReference → reference).
   *
   * @param params - Raw query params extracted from the completion URL.
   */
  static parsePaymentResponse(
    params: Record<string, string>
  ): FincraPaymentResponse {
    // Fincra sometimes returns the merchant ref under different keys
    const customRef =
      params['customerReference'] ?? params['merchantReference'];
    const internalRef =
      params['transactionReference'] ?? params['transactionId'];

    const finalRef = customRef ?? params['reference'] ?? '';
    const finalTxId =
      internalRef ?? (customRef != null ? params['reference'] ?? '' : '');

    return {
      reference: finalRef,
      transactionId: finalTxId ?? '',
      status: params['status'] ?? params['payment_status'] ?? 'unknown',
      message: params['message'],
      rawResponse: params,
    };
  }

  /**
   * Determines if a status string represents a successful payment.
   *
   * @param status - The raw status string from Fincra.
   */
  static isSuccessStatus(status: string): boolean {
    const normalized = status.toLowerCase().trim();
    return normalized === 'success' || normalized === 'successful';
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * Minimal absolute-URL parser. React Native's `URL` polyfill does not
   * implement `hostname`/`port`, so this is done by hand.
   * Returns `null` if the string is not an absolute `scheme://host` URL.
   */
  private static _parseUrl(
    url: string
  ): { scheme: string; host: string; port: string; path: string } | null {
    const match =
      /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)(?::(\d*))?([^?#]*)/i.exec(
        url.trim()
      );
    if (!match || !match[2]) return null;

    const scheme = match[1].toLowerCase();
    const defaultPort = DEFAULT_PORTS[scheme] ?? '';
    const port = match[3] || defaultPort;
    // Normalise trailing slashes so `/callback/` equals `/callback`
    const path = match[4].replace(/\/+$/, '');

    return { scheme, host: match[2].toLowerCase(), port, path };
  }

  /**
   * Parses URL query string into a `URLSearchParams`-like `Map`.
   * Works in React Native (no DOM `URL` API available).
   */
  private static _parseQueryParams(url: string): Map<string, string> {
    const map = new Map<string, string>();
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return map;

    const queryString = url.slice(queryStart + 1);
    const pairs = queryString.split('&');

    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = decodeURIComponent(pair.slice(0, eqIdx).replace(/\+/g, ' '));
      const val = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, ' '));
      if (key) map.set(key, val);
    }

    return map;
  }
}
