import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  FincraCheckout,
  FincraCheckoutHost,
  FeeBearer,
  FincraCurrency,
  type FincraCheckoutResult,
} from 'react-native-fincra-checkout';

// ─── Fincra Sandbox Keys (loaded from .env via EXPO_PUBLIC_ prefix) ────────────
const FINCRA_SANDBOX_API_KEY =
  process.env.EXPO_PUBLIC_FINCRA_SANDBOX_API_KEY ??
  '';
const FINCRA_SANDBOX_PUB_KEY =
  process.env.EXPO_PUBLIC_FINCRA_SANDBOX_PUB_KEY ??
  '';
const CHECKOUT_PAYMENTS_URL = 'https://sandboxapi.fincra.com/checkout/payments';
const REDIRECT_URL = 'https://myapp.com/callback';

export default function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    type: string;
    message: string;
    data?: unknown;
  } | null>(null);

  // ── 1. Backend Checkout URL Generation (Mirrors Flutter _generateCheckoutUrl) ──
  const generateCheckoutUrl = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(CHECKOUT_PAYMENTS_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': FINCRA_SANDBOX_API_KEY,
          'x-pub-key': FINCRA_SANDBOX_PUB_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          currency: 'NGN',
          amount: 5000,
          customer: {
            name: 'Customer Name',
            email: 'customer@theiremail.com',
          },
          paymentMethods: ['card', 'bank_transfer'],
          feeBearer: 'business',
          redirectUrl: REDIRECT_URL,
          reference: `ORDER-${Date.now()}`,
        }),
      });

      const data = (await response.json()) as {
        data?: { link?: string };
        message?: string;
      };

      if (response.ok && data?.data?.link) {
        return data.data.link;
      }

      Alert.alert(
        'API Error',
        data.message ?? `HTTP ${response.status}: Failed to create checkout URL`
      );
      return null;
    } catch (e) {
      Alert.alert('Network Error', String(e));
      return null;
    }
  }, []);

  // ── 2. Handle Checkout Result ────────────────────────────────────────────────
  const handleResult = useCallback((result: FincraCheckoutResult) => {
    switch (result.type) {
      case 'success':
        setLastResult({
          type: 'SUCCESS',
          message: `Payment Successful! Ref: ${result.response.reference}`,
          data: result.response,
        });
        Alert.alert(
          'Payment Successful ✅',
          `Reference:\n${result.response.reference}`
        );
        break;
      case 'error':
        setLastResult({
          type: 'ERROR',
          message: `Payment Failed: ${result.error.message}`,
          data: result.error,
        });
        Alert.alert('Payment Failed ❌', result.error.message);
        break;
      case 'cancelled':
        setLastResult({
          type: 'CANCELLED',
          message: 'Payment was cancelled by the user.',
        });
        Alert.alert('Cancelled ⚠️', 'Payment Cancelled by User');
        break;
    }
  }, []);

  // ── 3. Start WebView Checkout (Server-Side URL) ──────────────────────────────
  const startWebViewPayment = useCallback(async () => {
    setIsLoading(true);
    setLastResult(null);

    const checkoutUrl = await generateCheckoutUrl();
    setIsLoading(false);

    if (!checkoutUrl) return;

    try {
      const result = await FincraCheckout.openWebView({
        checkoutUrl,
        redirectUrl: REDIRECT_URL,
        headerTitle: 'Pay with Fincra',
        headerBackgroundColor: '#FFFFFF',
        showCancelConfirmationDialog: true,
      });

      handleResult(result);
    } catch (e) {
      Alert.alert('SDK Error', String(e));
    }
  }, [generateCheckoutUrl, handleResult]);

  // ── 4. Start Inline Checkout (Frontend JS Mode) ──────────────────────────────
  const startInlinePayment = useCallback(async () => {
    setLastResult(null);

    try {
      const result = await FincraCheckout.openInline({
        publicKey: FINCRA_SANDBOX_PUB_KEY,
        amount: 5000,
        currency: FincraCurrency.NGN,
        customerEmail: 'customer@theiremail.com',
        customerName: 'Customer Name',
        customerPhoneNumber: '07058149795',
        reference: `ORDER-${Date.now()}`,
        feeBearer: FeeBearer.Customer,
        paymentMethods: ['card', 'bank_transfer','palmpay'],
        headerTitle: 'Secure Inline Pay',
        showCancelConfirmationDialog: true,
    
      });

      handleResult(result);
    } catch (e) {
      Alert.alert('SDK Error', String(e));
    }
  }, [handleResult]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* ── REQUIRED: Singleton Host Mounted Once at App Root ── */}
      <FincraCheckoutHost />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.badge}>FINCRA SDK EXAMPLE</Text>
          <Text style={styles.title}>Sandbox Checkout</Text>
          <Text style={styles.subtitle}>
            Test React Native WebView and Inline payment flows against Fincra
            Sandbox.
          </Text>
        </View>

        {/* ── Payment Mode Card ── */}
        <View style={styles.card}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Test Amount</Text>
            <Text style={styles.amountValue}>₦5,000.00</Text>
          </View>

          <View style={styles.divider} />

          {/* WebView Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={startWebViewPayment}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Pay with WebView Checkout
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.buttonHint}>
            Generates backend checkout URL via API key, opens WebView modal
          </Text>

          {/* Inline Button */}
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={startInlinePayment}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>
              Pay with Inline Checkout
            </Text>
          </TouchableOpacity>
          <Text style={styles.buttonHint}>
            Client-side checkout initialized directly with public key
          </Text>
        </View>

        {/* ── Transaction Log Card (Shows real SDK result) ── */}
        {lastResult && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Last Transaction Result</Text>
              <View
                style={[
                  styles.statusBadge,
                  lastResult.type === 'SUCCESS' && styles.badgeSuccess,
                  lastResult.type === 'ERROR' && styles.badgeError,
                  lastResult.type === 'CANCELLED' && styles.badgeCancel,
                ]}
              >
                <Text style={styles.statusBadgeText}>{lastResult.type}</Text>
              </View>
            </View>
            <Text style={styles.resultMessage}>{lastResult.message}</Text>
            {lastResult.data != null && (
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>
                  {JSON.stringify(lastResult.data, null, 2)}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 28,
  },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066FF',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 24,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  amountValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 20,
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  primaryButton: {
    backgroundColor: '#0066FF',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginTop: 14,
  },
  secondaryButtonText: {
    color: '#4338CA',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonHint: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 4,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeError: {
    backgroundColor: '#FEE2E2',
  },
  badgeCancel: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
  },
  resultMessage: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 12,
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#E2E8F0',
  },
});
