import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
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
 *   customerPhoneNumber="08012345678"
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
  loadingComponent,
  closeIcon,
  onSuccess,
  onFailed,
  onCancelled,
  // Payment fields — everything the HTML generator needs
  ...paymentConfig
}: InlineCheckoutConfig) {
  const [isLoading, setIsLoading] = useState(true);
  const hasCompleted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fix #3: Memoize HTML generation — prevents WebView reload on parent re-renders.
  // The HTML is intentionally generated once per mount; payment params are immutable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => generateInlineHtml(paymentConfig), []);

  // ── 15-second init timeout ──────────────────────────────────────────────────
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (!hasCompleted.current) {
        hasCompleted.current = true;
        const err: FincraPaymentError = {
          code: 'timeout',
          message:
            'Fincra Checkout failed to load. Please check your internet connection.',
        };
        onFailed?.(err);
      }
    }, INIT_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── JS Bridge message handler ───────────────────────────────────────────────
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (hasCompleted.current) return;

      const msg = parseMessage(event.nativeEvent.data);

      switch (msg.event) {
        case FincraBridgeEvent.Ready:
          // SDK loaded — clear timeout and hide the loading spinner
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setIsLoading(false);
          break;

        case FincraBridgeEvent.Success:
          hasCompleted.current = true;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (msg.data && 'reference' in msg.data) {
            onSuccess?.(msg.data as FincraPaymentResponse);
          } else {
            onCancelled?.();
          }
          break;

        case FincraBridgeEvent.Closed:
          hasCompleted.current = true;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          onCancelled?.();
          break;

        case FincraBridgeEvent.Error: {
          hasCompleted.current = true;
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const errorMessage =
            msg.data && 'message' in msg.data
              ? (msg.data as { message: string }).message
              : 'An unknown error occurred';
          const err: FincraPaymentError = {
            code: 'fincra_sdk_error',
            message: errorMessage,
          };
          onFailed?.(err);
          break;
        }

        case FincraBridgeEvent.Unknown:
        default:
          // Ignore — mirrors Flutter's `case FincraBridgeEvent.unknown: break;`
          break;
      }
    },
    [onSuccess, onFailed, onCancelled, setIsLoading]
  );

  // ── Cancellation ────────────────────────────────────────────────────────────
  // Fix #4: Use static Alert import — no dynamic require() needed.
  const handleCancellation = useCallback(() => {
    if (hasCompleted.current) return;

    if (showCancelConfirmationDialog) {
      Alert.alert(
        'Cancel Payment?',
        'Are you sure you want to cancel this payment?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => {
              if (!hasCompleted.current) {
                hasCompleted.current = true;
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                onCancelled?.();
              }
            },
          },
        ]
      );
    } else {
      hasCompleted.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onCancelled?.();
    }
  }, [showCancelConfirmationDialog, onCancelled]);

  // Keep the ref in sync with the latest handleCancellation (Fix #10)
  useEffect(() => {
    handleCancellationRef.current = handleCancellation;
  });

  // ── Computed status bar style (Fix #11) ─────────────────────────────────────
  const statusBarStyle =
    headerTintColor === '#000000' ? 'dark-content' : 'light-content';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor={headerBackgroundColor}
      />

      {/* ── Header bar — shown during loading so the user can abort ── */}
      <View
        style={[styles.header, { backgroundColor: headerBackgroundColor }]}
      >
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
          // Fix #14: restrict to HTTPS + about:blank only (removed wildcard)
          originWhitelist={['https://*', 'about:blank']}
          source={{ html }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleMessage}
          // Inject the ReactNativeWebView bridge shim so older WKWebView versions work
          injectedJavaScriptBeforeContentLoaded={WEBVIEW_BRIDGE_SHIM}
          // Allow the external CDN script to load
          mixedContentMode="always"
          // Fix #15: removed allowFileAccess and allowUniversalAccessFromFileURLs —
          // the HTML is served as an inline blob, not a file:// URL, so these are
          // unnecessary and allowUniversalAccessFromFileURLs is a security footgun.
        />

        {/* ── Loading overlay ── */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingCard}>
              {loadingComponent ?? (
                <ActivityIndicator size="large" color="#0066FF" />
              )}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
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
});
