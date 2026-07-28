// ─── Public API ───────────────────────────────────────────────────────────────
//
// This is the single entry point for react-native-fincra-checkout.
// Import only what you need:
//
//   import { FincraCheckout, FincraCheckoutHost } from 'react-native-fincra-checkout';
//   import type { FincraCheckoutResult, WebViewCheckoutConfig } from 'react-native-fincra-checkout';

// ── Imperative API & Host ──────────────────────────────────────────────────────
export {
  FincraCheckout,
  FincraCheckoutHostRegistrar as FincraCheckoutHost,
} from './checkout/FincraCheckout';

// ── Declarative Components ─────────────────────────────────────────────────────
export { FincraWebViewCheckout } from './components/FincraWebViewCheckout';
export { FincraInlineCheckout } from './components/FincraInlineCheckout';

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  // Primitives
  FincraCurrency,
  FeeBearer,
  // Data models
  FincraPaymentResponse,
  FincraPaymentError,
  // Result discriminated union
  FincraCheckoutResult,
  // Component props / config
  BaseCheckoutProps,
  WebViewCheckoutConfig,
  InlineCheckoutConfig,
} from './types';
