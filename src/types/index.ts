import type { ReactNode } from 'react';

// ─── Primitives ───────────────────────────────────────────────────────────────

/**
 * Currencies supported by the Fincra platform.
 * Expands the Flutter enum (ngn, kes, ugx, ghs, zar, xaf, xof) with
 * additional global currencies from the prompt spec.
 */
export const FincraCurrency = {
  NGN: 'NGN',
  USD: 'USD',
  GBP: 'GBP',
  EUR: 'EUR',
  GHS: 'GHS',
  KES: 'KES',
  ZAR: 'ZAR',
  UGX: 'UGX',
  XAF: 'XAF',
  XOF: 'XOF',
} as const;

export type FincraCurrency =
  | 'NGN'
  | 'USD'
  | 'GBP'
  | 'EUR'
  | 'GHS'
  | 'KES'
  | 'ZAR'
  | 'UGX'
  | 'XAF'
  | 'XOF';

export const FeeBearer = {
  Business: 'business',
  Customer: 'customer',
  business: 'business',
  customer: 'customer',
} as const;

export type FeeBearer = 'business' | 'customer';

// ─── Payment Data Models ───────────────────────────────────────────────────────

/** Normalized successful payment response. */
export interface FincraPaymentResponse {
  /** Merchant/customer reference — mirrors Flutter's `FincraPaymentResponse.reference`. */
  reference: string;
  /** Fincra internal transaction ID. */
  transactionId: string;
  /** Payment status string (e.g., 'success', 'failed'). */
  status: string;
  /** Optional human-readable message from Fincra. */
  message?: string;
  /**
   * Full raw response map. All values are strings.
   * For inline mode, numeric/boolean fields from Fincra (e.g. `amount`) are
   * coerced to strings to match the URL-params format used in WebView mode.
   */
  rawResponse: Record<string, string>;
}

/** Structured payment error. */
export interface FincraPaymentError {
  /** Error code string (e.g., 'timeout', 'cancelled', HTTP status code). */
  code: string;
  /** Human-readable error description. */
  message: string;
}

// ─── Result Discriminated Union ────────────────────────────────────────────────

/**
 * All possible outcomes of a Fincra Checkout session.
 * Use `result.type` to discriminate:
 *
 * @example
 * ```typescript
 * switch (result.type) {
 *   case 'success':   handleSuccess(result.response); break;
 *   case 'error':     handleError(result.error);       break;
 *   case 'cancelled': handleCancelled();               break;
 * }
 * ```
 */
export type FincraCheckoutResult =
  | { type: 'success'; response: FincraPaymentResponse }
  | { type: 'error'; error: FincraPaymentError }
  | { type: 'cancelled' };

// ─── Component Props ───────────────────────────────────────────────────────────

/** Shared props across both checkout modes. */
export interface BaseCheckoutProps {
  /** Called when payment is successfully completed. */
  onSuccess?: (response: FincraPaymentResponse) => void;
  /** Called when the payment fails or encounters an error. */
  onFailed?: (error: FincraPaymentError) => void;
  /** Called when the user cancels/closes the checkout. */
  onCancelled?: () => void;
  /** Title shown in the navigation header. Defaults to 'Secure Checkout'. */
  headerTitle?: string;
  /** Background color of the navigation header bar. */
  headerBackgroundColor?: string;
  /**
   * Text/icon color inside the navigation header.
   * Also determines the status bar style:
   * - `'#000000'` (default) → `dark-content` status bar icons
   * - Any other value → `light-content` status bar icons
   */
  headerTintColor?: string;
  /** If true, shows a confirmation dialog before dismissing. Default: false. */
  showCancelConfirmationDialog?: boolean;
  /** Custom loading indicator to display while the WebView is loading. */
  loadingComponent?: ReactNode;
  /** Custom close icon/element for the header. */
  closeIcon?: ReactNode;
}

/** Configuration for the WebView-based checkout (backend-generated URL). */
export interface WebViewCheckoutConfig extends BaseCheckoutProps {
  /**
   * The backend-generated Fincra checkout URL.
   * Generate this server-side using the Fincra API with your **secret key**.
   * Never generate this on the client.
   */
  checkoutUrl: string;
  /**
   * Your backend redirect URL. When Fincra navigates to this URL,
   * the SDK intercepts and resolves the payment result.
   * If omitted, the SDK falls back to detecting `status` + `reference` query params.
   */
  redirectUrl?: string;
}

/** Configuration for the Inline JavaScript checkout (frontend-initiated). */
export interface InlineCheckoutConfig extends BaseCheckoutProps {
  /**
   * Your Fincra **public key** (starts with `pk_`).
   * @security Never use your secret key in mobile app code.
   */
  publicKey: string;
  /** Amount to charge in the smallest currency unit (e.g., kobo for NGN). */
  amount: number;
  /** Currency for the transaction. */
  currency: FincraCurrency;
  /** Customer's email address. */
  customerEmail: string;
  /** Customer's full name. */
  customerName: string;
  /** Customer's phone number. */
  customerPhoneNumber: string;
  /** Who bears the Fincra processing fee. */
  feeBearer: FeeBearer;
  /** Optional unique transaction reference. Fincra generates one if omitted. */
  reference?: string;
  /** Restrict checkout to specific payment methods (e.g., ['card', 'bank_transfer']). */
  paymentMethods?: string[];
}
