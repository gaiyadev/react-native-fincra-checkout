import type { InlineCheckoutConfig } from '../types';

// ─── HTML Generator ────────────────────────────────────────────────────────────
//
// Mirrors `_generateHtml()` in flutter_fincra_checkout/lib/src/inline/inline_checkout.dart
//
// Security: the whole options object is encoded via toScriptJson() — JSON
// plus escaping of `<`, `>`, `&`, U+2028 and U+2029 — so no input value can
// inject JS or close the surrounding <script> element.

const FINCRA_CDN_URL =
  'https://unpkg.com/@fincra-engineering/checkout@2.2.0/dist/inline.min.js';

/**
 * Narrowed config type: only the payment fields needed to generate the HTML.
 * Deliberately excludes UI props (`onSuccess`, `loadingComponent`, etc.) so
 * the generator can never accidentally embed callbacks as JS values.
 *
 * Fix #8: use a Pick instead of the full InlineCheckoutConfig.
 */
export type InlinePaymentConfig = Pick<
  InlineCheckoutConfig,
  | 'publicKey'
  | 'amount'
  | 'currency'
  | 'customerName'
  | 'customerEmail'
  | 'customerPhoneNumber'
  | 'feeBearer'
  | 'reference'
  | 'paymentMethods'
>;

/** Options passed to `Fincra.initialize()` (callbacks are added in the page). */
export interface InlineSdkOptions {
  key: string;
  amount: number;
  currency: string;
  feeBearer: string;
  reference?: string;
  paymentMethods?: string[];
  customer: { name: string; email: string; phoneNumber?: string };
}

/**
 * Builds the plain options object for `Fincra.initialize()`.
 *
 * Optional fields are omitted entirely when absent. `customer.phoneNumber`
 * is optional in Fincra's API: it is trimmed, and left out when blank.
 *
 * Pure function — internal, not part of the package's public API.
 */
export function buildInlineOptions(
  config: InlinePaymentConfig
): InlineSdkOptions {
  const customer: InlineSdkOptions['customer'] = {
    name: config.customerName,
    email: config.customerEmail,
  };
  const phone = config.customerPhoneNumber?.trim();
  if (phone) customer.phoneNumber = phone;

  const options: InlineSdkOptions = {
    key: config.publicKey,
    amount: config.amount,
    currency: config.currency.toUpperCase(),
    feeBearer: config.feeBearer,
    customer,
  };
  if (config.reference != null) options.reference = config.reference;
  if (config.paymentMethods != null && config.paymentMethods.length > 0) {
    options.paymentMethods = config.paymentMethods;
  }
  return options;
}

/**
 * JSON-encodes a value for embedding inside an inline `<script>` block.
 * Besides JSON escaping, `<`, `>` and `&` are escaped so a value containing
 * `</script>` or `<!--` cannot break out of the script element, and
 * U+2028/U+2029 are escaped for older JS engines.
 */
export function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Generates the self-contained HTML page that loads the Fincra inline JS SDK,
 * initializes it with the provided config, and posts lifecycle events back to
 * the React Native app via `window.ReactNativeWebView.postMessage(...)`.
 *
 * This function is **pure** — given the same config it always returns the same
 * string, making it safe to memoize with `useMemo`.
 *
 * @param config - The inline payment configuration (payment fields only).
 * @returns A complete HTML string to be loaded into a WebView.
 */
export function generateInlineHtml(config: InlinePaymentConfig): string {
  // ── Safe encoding — every value goes through toScriptJson() ──
  const optionsJson = toScriptJson(buildInlineOptions(config));

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="${FINCRA_CDN_URL}"></script>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background-color: transparent;
      -webkit-overflow-scrolling: touch;
    }
  </style>
</head>
<body>
  <script>
    /**
     * Posts a structured message to the React Native host.
     * Uses window.ReactNativeWebView which is injected by react-native-webview.
     */
    function postToRN(event, data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ event: event, data: data || null }));
      }
    }

    /**
     * Retry loop — waits up to 15 seconds (150 × 100ms) for window.Fincra to load.
     * Mirrors the identical pattern in the Flutter package's _generateHtml().
     */
    function initFincra(attempts) {
      if (attempts === undefined) attempts = 0;

      if (typeof Fincra === 'undefined') {
        if (attempts > 150) {
          postToRN('error', { message: 'Fincra SDK failed to load. Check your internet connection.' });
          return;
        }
        setTimeout(function() { initFincra(attempts + 1); }, 100);
        return;
      }

      // SDK is available — signal "ready" so the host hides the loading spinner
      postToRN('ready', null);

      var options = Object.assign(${optionsJson}, {
        onClose: function() {
          postToRN('closed', null);
        },
        onSuccess: function(data) {
          postToRN('success', data);
        },
      });

      Fincra.initialize(options);
    }

    window.onload = function() { initFincra(0); };
  </script>
</body>
</html>`;
}
