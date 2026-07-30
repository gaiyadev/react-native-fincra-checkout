import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  WebViewNavigation,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  ShouldStartLoadRequest,
} from 'react-native-webview/lib/WebViewTypes';
import { WebView } from 'react-native-webview';
import type { WebViewCheckoutConfig, FincraPaymentError } from '../types';
import { UrlHandler } from '../utils/UrlHandler';

// ─── FincraWebViewCheckout ────────────────────────────────────────────────────
//
// Declarative component for the WebView-based checkout flow.
// Mirrors CheckoutWebView widget in checkout_webview.dart
//
// Renders a backend-generated Fincra checkout URL inside react-native-webview,
// intercepts navigation to the redirect URL (or status+reference query params),
// and fires the appropriate callback.

export type FincraWebViewCheckoutProps = WebViewCheckoutConfig;

/**
 * A full-screen WebView that loads a backend-generated Fincra checkout URL.
 *
 * @example
 * ```tsx
 * <FincraWebViewCheckout
 *   checkoutUrl="https://checkout.fincra.com/pay/..."
 *   redirectUrl="https://your-backend.com/payment/callback"
 *   onSuccess={(res) => console.log('Paid:', res.reference)}
 *   onFailed={(err) => console.log('Failed:', err.message)}
 *   onCancelled={() => navigation.goBack()}
 * />
 * ```
 */
export function FincraWebViewCheckout({
  checkoutUrl,
  redirectUrl,
  headerTitle = 'Secure Checkout',
  headerBackgroundColor = '#FFFFFF',
  headerTintColor = '#000000',
  showCancelConfirmationDialog = false,
  loadingComponent,
  closeIcon,
  renderError,
  onSuccess,
  onFailed,
  onCancelled,
}: FincraWebViewCheckoutProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<FincraPaymentError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const webViewRef = useRef<WebView<object> | null>(null);
  const hasCompleted = useRef(false);

  // Fix #10: Stable ref for handleCancellation — the BackHandler effect
  // always calls through this ref, never capturing a stale closure.
  const handleCancellationRef = useRef<() => void>(() => {});

  // ── Back handler (Android) ──────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleCancellationRef.current();
        return true; // consume the event
      }
    );
    return () => subscription.remove();
  }, []); // safe: always calls through the ref

  // ── Completion handler ──────────────────────────────────────────────────────
  const handleCompletion = useCallback(
    (url: string) => {
      if (hasCompleted.current) return;
      hasCompleted.current = true;

      const params = UrlHandler.extractResponseParams(url);
      // Safely assume success if status is missing (matches Flutter behaviour)
      const rawStatus = params['status']?.toLowerCase() ?? 'success';

      if (UrlHandler.isSuccessStatus(rawStatus)) {
        const response = UrlHandler.parsePaymentResponse(params);
        onSuccess?.(response);
      } else {
        const err: FincraPaymentError = {
          code: rawStatus,
          message: params['message'] ?? 'Payment failed',
        };
        onFailed?.(err);
      }
    },
    [onSuccess, onFailed]
  );

  // ── URL interception ────────────────────────────────────────────────────────
  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      if (UrlHandler.isCompletionUrl(request.url, redirectUrl)) {
        handleCompletion(request.url);
        return false; // prevent navigation — mirrors NavigationDecision.prevent
      }
      return true;
    },
    [redirectUrl, handleCompletion]
  );

  // ── Cancellation ────────────────────────────────────────────────────────────
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
                onCancelled?.();
              }
            },
          },
        ]
      );
    } else {
      hasCompleted.current = true;
      onCancelled?.();
    }
  }, [showCancelConfirmationDialog, onCancelled]);

  // Keep the ref in sync after every render (Fix #10)
  useEffect(() => {
    handleCancellationRef.current = handleCancellation;
  });

  // ── WebView error ───────────────────────────────────────────────────────────
  const handleError = useCallback(
    (syntheticEvent: WebViewErrorEvent): void => {
      if (hasCompleted.current) return;
      const { nativeEvent } = syntheticEvent;
      const err: FincraPaymentError = {
        code: String(nativeEvent.code ?? 'webview_error'),
        message: nativeEvent.description ?? 'A WebView error occurred.',
      };
      setErrorState(err);
      setIsLoading(false);
    },
    []
  );

  // ── HTTP error (non-completion URLs only) ───────────────────────────────────
  const handleHttpError = useCallback(
    (e: WebViewHttpErrorEvent): void => {
      if (!UrlHandler.isCompletionUrl(e.nativeEvent.url, redirectUrl)) {
        handleError(e as unknown as WebViewErrorEvent);
      }
    },
    [redirectUrl, handleError]
  );

  // ── Retry handler ───────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setErrorState(null);
    setIsLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  // ── Navigation state change (iOS fallback) ──────────────────────────────────
  // Fix #2: guard setIsLoading — don't flip loading state after completion.
  const onNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      if (hasCompleted.current) return;
      if (
        navState.url &&
        UrlHandler.isCompletionUrl(navState.url, redirectUrl)
      ) {
        handleCompletion(navState.url);
      }
    },
    [redirectUrl, handleCompletion]
  );

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
      {/* ── Header bar ── */}
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
        {/* Spacer to centre the title */}
        <View style={styles.closeButton} />
      </View>

      {/* ── WebView ── */}
      <View style={styles.webViewContainer}>
        <WebView
          key={reloadKey}
          ref={webViewRef}
          source={{ uri: checkoutUrl }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          onLoadStart={() => {
            if (!hasCompleted.current) setIsLoading(true);
          }}
          onLoadEnd={() => {
            if (!hasCompleted.current) setIsLoading(false);
          }}
          onError={handleError}
          onHttpError={handleHttpError}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onNavigationStateChange={onNavigationStateChange}
          // Fix #14: restrict to HTTPS + about:blank — prevents intent:// and
          // other dangerous scheme navigations in a payment context.
          originWhitelist={['https://*', 'about:blank']}
        />

        {/* ── Loading overlay ── */}
        {isLoading && !errorState && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            {loadingComponent ?? (
              <ActivityIndicator size="large" color="#0066FF" />
            )}
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
  );
}

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
