import type { FincraPaymentResponse } from '../types';

// ─── URL Handler ──────────────────────────────────────────────────────────────
//
// Direct TypeScript port of flutter_fincra_checkout/lib/src/utils/url_handler.dart
// Mirrors UrlHandler.isCompletionUrl() and UrlHandler.extractResponseParams()

/**
 * Utilities for detecting Fincra payment completion URLs and
 * extracting normalized response parameters.
 */
export class UrlHandler {
  /**
   * Returns `true` if the given URL signals a Fincra payment completion.
   *
   * Logic (mirrors Flutter):
   * 1. If `expectedRedirectUrl` is provided, check `url.startsWith(expectedRedirectUrl)`.
   * 2. Fallback: Fincra appends `status` (or `payment_status`) AND `reference` as query params.
   *
   * @param url - The URL being navigated to.
   * @param expectedRedirectUrl - The redirect URL you registered on your backend.
   */
  static isCompletionUrl(url: string, expectedRedirectUrl?: string): boolean {
    if (!url) return false;

    if (expectedRedirectUrl && expectedRedirectUrl.length > 0) {
      return url.startsWith(expectedRedirectUrl);
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
      status: params['status'] ?? 'unknown',
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
