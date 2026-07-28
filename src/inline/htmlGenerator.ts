import type { InlineCheckoutConfig } from '../types';

// ─── HTML Generator ────────────────────────────────────────────────────────────
//
// Mirrors `_generateHtml()` in flutter_fincra_checkout/lib/src/inline/inline_checkout.dart
//
// Security: ALL user-supplied string values are encoded via JSON.stringify(),
// which escapes special characters and wraps in double-quotes, preventing
// HTML/JS injection attacks (same approach as the Flutter implementation).

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
  // ── Safe encoding — all string values JSON-encoded to prevent injection ──
  const key = JSON.stringify(config.publicKey);
  const amount = config.amount; // numeric — safe to embed directly
  const currency = JSON.stringify(config.currency.toUpperCase());
  const name = JSON.stringify(config.customerName);
  const email = JSON.stringify(config.customerEmail);
  const phone = JSON.stringify(config.customerPhoneNumber);
  const feeBearer = JSON.stringify(config.feeBearer);

  // Optional fields — only emit the JS property if the value is present
  const referenceLine =
    config.reference != null
      ? `reference: ${JSON.stringify(config.reference)},`
      : '';

  const paymentMethodsLine =
    config.paymentMethods != null && config.paymentMethods.length > 0
      ? `paymentMethods: ${JSON.stringify(config.paymentMethods)},`
      : '';

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

      var options = {
        key: ${key},
        amount: ${amount},
        currency: ${currency},
        ${referenceLine}
        ${paymentMethodsLine}
        feeBearer: ${feeBearer},
        customer: {
          name: ${name},
          email: ${email},
          phoneNumber: ${phone},
        },
        onClose: function() {
          postToRN('closed', null);
        },
        onSuccess: function(data) {
          postToRN('success', data);
        },
      };

      Fincra.initialize(options);
    }

    window.onload = function() { initFincra(0); };
  </script>
</body>
</html>`;
}
