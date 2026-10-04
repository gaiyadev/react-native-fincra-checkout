import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
} from 'react-native-webview/lib/WebViewTypes';
import type {
  InlineCheckoutConfig,
  FincraPaymentError,
  FincraPaymentResponse,
} from '../types';
import { generateInlineHtml } from '../inline/htmlGenerator';
import { FincraBridgeEvent, parseMessage } from '../inline/JsBridge';

// ─── FincraInlineCheckout ─────────────────────────────────────────────────────
//
// Declarative component for the Inline JavaScript checkout flow.
// Mirrors InlineCheckout widget in inline_checkout.dart
//
// Loads a self-contained HTML page that bootstraps the Fincra JS SDK,
// communicates results back via window.ReactNativeWebView.postMessage(),
// and implements a 15-second timeout fallback.

/** 15 seconds in milliseconds — mirrors Flutter's `Timer(Duration(seconds: 15), ...)` */
const INIT_TIMEOUT_MS = 15_000;

/**
 * A transparent WebView that runs the Fincra inline JavaScript SDK.
 *
 * @example
 * ```tsx
 * <FincraInlineCheckout
 *   publicKey="pk_live_xxxx"
 *   amount={5000}
 *   currency="NGN"
 *   customerEmail="user@example.com"
 *   customerName="John Doe"
 *   feeBearer="customer"
 *   onSuccess={(res) => console.log(res.reference)}
 *   onCancelled={() => navigation.goBack()}
 * />
 * ```
 */
export function FincraInlineCheckout({
  headerTitle = 'Secure Checkout',
  headerBackgroundColor = '#FFFFFF',
  headerTintColor = '#000000',
  showCancelConfirmationDialog = false,
  showCloseButton = true,
  loadingComponent,
  closeIcon,
  renderError,
  onSuccess,
  onFailed,
  onCancelled,
  // Payment fields — everything the HTML generator needs
  ...paymentConfig
}: InlineCheckoutConfig) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<FincraPaymentError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const webViewRef = useRef<WebView<object> | null>(null);
  // `settledRef`: a result (success / error / cancel) has been delivered.
  // `isMountedRef`: late bridge messages after unmount must be ignored.
  const settledRef = useRef(false);
  const isMountedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** True while callbacks may still update state or deliver a result. */
  const isActive = useCallback(
    () => isMountedRef.current && !settledRef.current,
    []
  );

  const clearInitTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  /** Single exit point — delivers at most one result per session. */
  const settle = useCallback(
    (deliver: () => void) => {
      if (!isMountedRef.current || settledRef.current) return;
      settledRef.current = true;
      clearInitTimeout();
      deliver();
    },
    [clearInitTimeout]
  );

  // Fix #3: Memoize HTML generation — prevents WebView reload on parent re-renders.
  // The HTML is intentionally generated once per mount; payment params are immutable.
  const configJson = JSON.stringify(paymentConfig);
  const html = useMemo(
    () => generateInlineHtml(JSON.parse(configJson)),
    [configJson]
  );

  // ── 15-second init timeout (re-armed on every Retry) ────────────────────────
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (!isActive()) return;
      const err: FincraPaymentError = {
        code: 'timeout',
        message:
          'Fincra Checkout failed to load. Please check your internet connection.',
      };
      setErrorState(err);
      setIsLoading(false);
    }, INIT_TIMEOUT_MS);

    return clearInitTimeout;
  }, [reloadKey, isActive, clearInitTimeout]);

  // Fix #10: Stable ref for handleCancellation so the BackHandler effect
  // doesn't need it as a dependency and never captures a stale closure.
  const handleCancellationRef = useRef<() => void>(() => {});

  // ── Android back button ─────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleCancellationRef.current();
        return true;
      }
    );
    return () => subscription.remove();
  }, []); // safe: always calls through the ref

  // ── Load errors (main frame only — see FincraWebViewCheckout) ───────────────
  const showLoadError = useCallback(
    (err: FincraPaymentError): void => {
      if (!isActive()) return;
      clearInitTimeout();
      setErrorState(err);
      setIsLoading(false);
    },
    [isActive, clearInitTimeout, setErrorState, setIsLoading]
  );

  const handleError = useCallback(
    ({ nativeEvent }: WebViewErrorEvent): void => {
      showLoadError({
        code: String(nativeEvent.code ?? 'webview_error'),
        message: nativeEvent.description ?? 'A WebView error occurred.',
      });
    },
    [showLoadError]
  );

  const handleHttpError = useCallback(
    ({ nativeEvent }: WebViewHttpErrorEvent): void => {
      showLoadError({
        code: String(nativeEvent.statusCode ?? 'http_error'),
        message: nativeEvent.description ?? 'A WebView HTTP error occurred.',
      });
    },
    [showLoadError]
  );

  // ── Retry handler ───────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setErrorState(null);
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, [setErrorState, setIsLoading, setReloadKey]);

  // ── JS Bridge message handler ───────────────────────────────────────────────
  // Messages that arrive after the session settled (e.g. closed via the
  // Android back button) or after unmount are ignored.
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (!isActive()) return;

      const msg = parseMessage(event.nativeEvent.data);

      switch (msg.event) {
        case FincraBridgeEvent.Ready:
          // SDK loaded — clear timeout and hide the loading spinner
          clearInitTimeout();
          setIsLoading(false);
          break;

        case FincraBridgeEvent.Success: {
          // Always a success, even without data (empty references).
          const response = msg.data as FincraPaymentResponse;
          settle(() => onSuccess?.(response));
          break;
        }

        case FincraBridgeEvent.Closed:
          settle(() => onCancelled?.());
          break;

        case FincraBridgeEvent.Error: {
          const errorMessage =
            msg.data && 'message' in msg.data && msg.data.message
              ? msg.data.message
              : 'An unknown error occurred';
          const err: FincraPaymentError = {
            code: 'fincra_sdk_error',
            message: errorMessage,
          };
          settle(() => onFailed?.(err));
          break;
        }

        case FincraBridgeEvent.Unknown:
        default:
          // Ignore — mirrors Flutter's `case FincraBridgeEvent.unknown: break;`
          break;
      }
    },
    [
      isActive,
      clearInitTimeout,
      settle,
      setIsLoading,
      onSuccess,
      onFailed,
      onCancelled,
    ]
  );

  // ── Cancellation ────────────────────────────────────────────────────────────
  // Fix #4: Use static Alert import — no dynamic require() needed.
  const handleCancellation = useCallback(() => {
    if (!isActive()) return;

    if (showCancelConfirmationDialog) {
      Alert.alert(
        'Cancel Payment?',
        'Are you sure you want to cancel this payment?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            // May fire after unmount — settle() ignores it then.
            onPress: () => settle(() => onCancelled?.()),
          },
        ]
      );
    } else {
      settle(() => onCancelled?.());
    }
  }, [isActive, showCancelConfirmationDialog, settle, onCancelled]);

  // Keep the ref in sync with the latest handleCancellation (Fix #10)
  useEffect(() => {
    handleCancellationRef.current = handleCancellation;
  });

  // ── Computed status bar style (Fix #11) ─────────────────────────────────────
  const statusBarStyle =
    headerTintColor === '#000000' ? 'dark-content' : 'light-content';

  // ── Render ──────────────────────────────────────────────────────────────────
  // Own SafeAreaProvider: SafeAreaView reads insets from the nearest provider,
  // and a Modal (FincraCheckoutHost) is a separate native tree. Without one the
  // insets are 0 and the header sits under the status bar / Dynamic Island,
  // where iOS swallows taps. Nested providers are fine if the app has its own.
  return (
    <SafeAreaProvider style={styles.provider}>
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle={statusBarStyle}
          backgroundColor={headerBackgroundColor}
        />

        {/* ── Header bar — shown during loading so the user can abort ── */}
        <View
          style={[styles.header, { backgroundColor: headerBackgroundColor }]}
        >
          {/* Spacer keeps the title centred when the close button is hidden */}
          {showCloseButton ? (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCancellation}
              accessibilityLabel="Close checkout"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {closeIcon ?? (
                <Text style={[styles.closeIcon, { color: headerTintColor }]}>
                  ✕
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.closeButton} />
          )}
          <Text
            style={[styles.headerTitle, { color: headerTintColor }]}
            numberOfLines={1}
          >
            {headerTitle}
          </Text>
          <View style={styles.closeButton} />
        </View>

        {/* ── WebView running Fincra inline JS SDK ── */}
        <View style={styles.webViewContainer}>
          <WebView
            key={reloadKey}
            ref={webViewRef}
            // Fix #14: restrict to HTTPS + about:blank only (removed wildcard)
            originWhitelist={['https://*', 'about:blank']}
            source={{ html }}
            style={styles.webView}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleMessage}
            onError={handleError}
            onHttpError={handleHttpError}
            // Inject the ReactNativeWebView bridge shim so older WKWebView versions work
            injectedJavaScriptBeforeContentLoaded={WEBVIEW_BRIDGE_SHIM}
            // Allow the external CDN script to load
            mixedContentMode="always"
            // Fix #15: removed allowFileAccess and allowUniversalAccessFromFileURLs —
            // the HTML is served as an inline blob, not a file:// URL, so these are
            // unnecessary and allowUniversalAccessFromFileURLs is a security footgun.
          />

          {/* ── Loading overlay ── */}
          {isLoading && !errorState && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingCard}>
                {loadingComponent ?? (
                  <ActivityIndicator size="large" color="#0066FF" />
                )}
              </View>
            </View>
          )}

          {/* ── Error Recovery overlay ── */}
          {errorState && (
            <View style={styles.errorOverlay}>
              {renderError ? (
                renderError(errorState, handleRetry)
              ) : (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorTitle}>Connection Error</Text>
                  <Text style={styles.errorMessage}>{errorState.message}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={handleRetry}
                    accessibilityRole="button"
                    accessibilityLabel="Retry loading checkout"
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancellation}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel checkout"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ─── WebView Bridge Shim ───────────────────────────────────────────────────────
// Ensures `window.ReactNativeWebView` is available before page scripts run.
const WEBVIEW_BRIDGE_SHIM = `
  (function() {
    if (!window.ReactNativeWebView) {
      window.ReactNativeWebView = {
        postMessage: function(msg) {
          window.webkit && window.webkit.messageHandlers &&
          window.webkit.messageHandlers.ReactNativeWebView &&
          window.webkit.messageHandlers.ReactNativeWebView.postMessage(msg);
        }
      };
    }
  })();
  true;
`;

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  provider: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  loadingCard: {
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorContainer: {
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#0066FF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '500',
  },
});
