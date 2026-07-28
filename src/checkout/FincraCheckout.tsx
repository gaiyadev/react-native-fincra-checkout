import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import type {
  WebViewCheckoutConfig,
  InlineCheckoutConfig,
  FincraCheckoutResult,
  FincraPaymentResponse,
  FincraPaymentError,
} from '../types';
import { FincraWebViewCheckout } from '../components/FincraWebViewCheckout';
import { FincraInlineCheckout } from '../components/FincraInlineCheckout';

// ─── Imperative Modal API ─────────────────────────────────────────────────────
//
// Mirrors the static FincraCheckout class in fincra_checkout.dart,
// adapted to React Native's component model using a singleton ref pattern
// (the same approach used by react-native-toast-message).
//
// Usage:
//   1. Add <FincraCheckoutHost /> to your App root (once, at the top level).
//   2. Call FincraCheckout.openWebView({...}) / FincraCheckout.openInline({...})
//      from anywhere — no context or navigation prop needed.

// ── Internal state types ──────────────────────────────────────────────────────

type ModalMode = 'webview' | 'inline' | null;

// Fix #12: removed the dead `resolve` field — the resolve fn is stored in
// resolveRef, not in ModalState. Keeping it here only confused readers.
interface ModalState {
  mode: ModalMode;
  webViewConfig?: WebViewCheckoutConfig;
  inlineConfig?: InlineCheckoutConfig;
}

// ── Host ref API ──────────────────────────────────────────────────────────────

/**
 * @internal
 * Imperative handle for the FincraCheckoutHost ref.
 * Do not call `_openWebView` / `_openInline` directly — use `FincraCheckout.open*()`.
 */
export interface FincraCheckoutHostHandle {
  _openWebView(
    config: WebViewCheckoutConfig
  ): Promise<FincraCheckoutResult>;
  _openInline(
    config: InlineCheckoutConfig
  ): Promise<FincraCheckoutResult>;
}

/**
 * Place this component once at your app root (inside your root view, after
 * your navigator/providers). It renders nothing until `FincraCheckout.open*()`
 * is called — then it mounts a full-screen `Modal` over the current UI.
 *
 * @example
 * ```tsx
 * // App.tsx
 * export default function App() {
 *   return (
 *     <NavigationContainer>
 *       <RootNavigator />
 *       <FincraCheckoutHost />  {/* ← add this once *\/}
 *     </NavigationContainer>
 *   );
 * }
 * ```
 */
export const FincraCheckoutHost = forwardRef<FincraCheckoutHostHandle>(
  function FincraCheckoutHost(_props, ref) {
    const [modalState, setModalState] = useState<ModalState>({ mode: null });
    const resolveRef = useRef<((result: FincraCheckoutResult) => void) | null>(
      null
    );

    // ── Resolve and dismiss ────────────────────────────────────────────────────
    const resolve = useCallback((result: FincraCheckoutResult) => {
      setModalState({ mode: null });
      resolveRef.current?.(result);
      resolveRef.current = null;
    }, []);

    // ── Expose imperative methods via ref ──────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        // Fix #1: guard against double-open — reject instead of orphaning the
        // pending Promise and silently clobbering resolveRef.
        _openWebView(config: WebViewCheckoutConfig): Promise<FincraCheckoutResult> {
          if (resolveRef.current) {
            return Promise.reject(
              new Error(
                '[FincraCheckout] A checkout session is already open. ' +
                  'Await the current session before opening another.'
              )
            );
          }
          return new Promise((res) => {
            resolveRef.current = res;
            setModalState({ mode: 'webview', webViewConfig: config });
          });
        },
        _openInline(config: InlineCheckoutConfig): Promise<FincraCheckoutResult> {
          if (resolveRef.current) {
            return Promise.reject(
              new Error(
                '[FincraCheckout] A checkout session is already open. ' +
                  'Await the current session before opening another.'
              )
            );
          }
          return new Promise((res) => {
            resolveRef.current = res;
            setModalState({ mode: 'inline', inlineConfig: config });
          });
        },
      }),
      [/* resolve not needed — used via resolveRef */]
    );

    const isVisible = modalState.mode !== null;

    // ── Shared callback builders ───────────────────────────────────────────────
    const buildCallbacks = useCallback(
      (config: WebViewCheckoutConfig | InlineCheckoutConfig) => ({
        onSuccess: (response: FincraPaymentResponse) => {
          config.onSuccess?.(response);
          resolve({ type: 'success', response });
        },
        onFailed: (error: FincraPaymentError) => {
          config.onFailed?.(error);
          resolve({ type: 'error', error });
        },
        onCancelled: () => {
          config.onCancelled?.();
          resolve({ type: 'cancelled' });
        },
      }),
      [resolve]
    );

    return (
      <Modal
        visible={isVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => {
          // Android hardware back — treat as cancellation
          const cfg =
            modalState.webViewConfig ?? modalState.inlineConfig;
          if (cfg) {
            cfg.onCancelled?.();
          }
          resolve({ type: 'cancelled' });
        }}
      >
        <View style={styles.fullscreen}>
          {modalState.mode === 'webview' && modalState.webViewConfig && (
            <FincraWebViewCheckout
              {...modalState.webViewConfig}
              {...buildCallbacks(modalState.webViewConfig)}
            />
          )}
          {modalState.mode === 'inline' && modalState.inlineConfig && (
            <FincraInlineCheckout
              {...modalState.inlineConfig}
              {...buildCallbacks(modalState.inlineConfig)}
            />
          )}
        </View>
      </Modal>
    );
  }
);

// ─── Singleton Ref ─────────────────────────────────────────────────────────────
// A module-level ref that FincraCheckout.open*() calls are routed through.
// Set by the first <FincraCheckoutHost /> that mounts.
let _hostRef: React.RefObject<FincraCheckoutHostHandle | null> | null = null;

/**
 * @internal
 * Called by `<FincraCheckoutHostRegistrar />` to register the singleton ref.
 * Not part of the public API — do not call this directly.
 */
export function _registerHostRef(
  ref: React.RefObject<FincraCheckoutHostHandle | null>
): void {
  _hostRef = ref;
}

/**
 * @internal
 * Clears the singleton ref when the host unmounts.
 * Not part of the public API — do not call this directly.
 */
export function _unregisterHostRef(): void {
  _hostRef = null;
}

// ─── Public FincraCheckout Static API ─────────────────────────────────────────

/**
 * Imperative static API for opening Fincra Checkout modals from anywhere
 * in your app — no navigation prop or context required.
 *
 * **Prerequisite**: `<FincraCheckoutHost />` must be mounted at your app root.
 *
 * @example
 * ```typescript
 * // WebView mode (recommended — backend-generated URL)
 * const result = await FincraCheckout.openWebView({
 *   checkoutUrl: 'https://checkout.fincra.com/pay/...',
 *   redirectUrl: 'https://api.yourapp.com/payment/callback',
 * });
 *
 * // Inline mode (frontend-initiated)
 * const result = await FincraCheckout.openInline({
 *   publicKey: 'pk_live_...',
 *   amount: 5000,
 *   currency: 'NGN',
 *   customerEmail: 'user@example.com',
 *   customerName: 'Jane Doe',
 *   customerPhoneNumber: '08012345678',
 *   feeBearer: 'customer',
 * });
 *
 * switch (result.type) {
 *   case 'success':   console.log(result.response.reference); break;
 *   case 'error':     console.error(result.error.message);    break;
 *   case 'cancelled': console.log('User cancelled');          break;
 * }
 * ```
 */
export class FincraCheckout {
  /**
   * Opens the WebView checkout in a full-screen modal.
   *
   * This is the **recommended** flow — your backend generates the `checkoutUrl`
   * using the Fincra API with your **secret key** (never in the app).
   *
   * @param config - WebView checkout configuration.
   * @returns A promise resolving to a `FincraCheckoutResult` discriminated union.
   * @throws Error if `<FincraCheckoutHost />` is not mounted.
   * @throws Error if a checkout session is already open.
   */
  static openWebView(
    config: WebViewCheckoutConfig
  ): Promise<FincraCheckoutResult> {
    FincraCheckout._assertHostMounted();
    return _hostRef!.current!._openWebView(config);
  }

  /**
   * Opens the Inline JavaScript checkout in a full-screen modal.
   *
   * Uses only the Fincra **public key** (`pk_...`).
   * The Fincra JS SDK is loaded from the CDN at runtime.
   *
   * @param config - Inline checkout configuration.
   * @returns A promise resolving to a `FincraCheckoutResult` discriminated union.
   * @throws Error if `<FincraCheckoutHost />` is not mounted.
   * @throws Error if a checkout session is already open.
   */
  static openInline(
    config: InlineCheckoutConfig
  ): Promise<FincraCheckoutResult> {
    FincraCheckout._assertHostMounted();
    return _hostRef!.current!._openInline(config);
  }

  private static _assertHostMounted(): void {
    if (!_hostRef?.current) {
      throw new Error(
        '[react-native-fincra-checkout] FincraCheckoutHost is not mounted. ' +
          'Add <FincraCheckoutHost /> to your App root before calling FincraCheckout.open*().'
      );
    }
  }
}

// ─── Self-registering Host wrapper ────────────────────────────────────────────

/**
 * The component you add to your app root.
 * It self-registers as the singleton checkout host.
 *
 * @example
 * ```tsx
 * // App.tsx
 * import { FincraCheckoutHost } from 'react-native-fincra-checkout';
 *
 * export default function App() {
 *   return (
 *     <>
 *       <YourApp />
 *       <FincraCheckoutHost />
 *     </>
 *   );
 * }
 * ```
 */
export function FincraCheckoutHostRegistrar() {
  const ref = useRef<FincraCheckoutHostHandle | null>(null);

  useEffect(() => {
    _registerHostRef(ref as React.RefObject<FincraCheckoutHostHandle | null>);
    return () => _unregisterHostRef();
  }, []);

  return <FincraCheckoutHost ref={ref} />;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
  },
});
