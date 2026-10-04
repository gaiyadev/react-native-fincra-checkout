# react-native-fincra-checkout

<p align="center">
  <img src="https://img.shields.io/npm/v/react-native-fincra-checkout?color=0066FF&style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/badge/TypeScript-100%25-blue?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey?style=flat-square" alt="platforms" />
</p>

A **production-ready**, **100% TypeScript** React Native SDK for [Fincra Checkout](https://fincra.com/checkout), with full feature and architectural parity with the official `flutter_fincra_checkout` package.

---

## Features

- ✅ **Two checkout modes**: WebView (recommended) and Inline JavaScript
- ✅ **Imperative API**: `await FincraCheckout.openWebView({...})` from anywhere
- ✅ **Declarative API**: `<FincraWebViewCheckout />` and `<FincraInlineCheckout />`
- ✅ **Strongly-typed result**: Discriminated union — `success | error | cancelled`
- ✅ **URL interception**: Strict redirect URL match (scheme, host, port, path boundary) + query-param fallback
- ✅ **15-second init timeout** for the Inline mode
- ✅ **Modern SafeAreaView** via `react-native-safe-area-context`
- ✅ **Built-in Error Recovery & Offline Retry UI** with custom `renderError` prop support
- ✅ **Android back button** support
- ✅ **Cancellation confirmation dialog** (optional)
- ✅ **XSS-safe** HTML generation (all inputs JSON-encoded)

---

## Installation

```bash
npm install react-native-fincra-checkout react-native-webview react-native-safe-area-context
# or
yarn add react-native-fincra-checkout react-native-webview react-native-safe-area-context
```

### iOS — link native modules

```bash
cd ios && pod install
```

### Android — no extra steps needed

`react-native-webview` auto-links on Android.

---

## ⚠️ Security Notice

> **Never store your Fincra Secret Key in your mobile app bundle.**
>
> - For **WebView Checkout**: Generate the `checkoutUrl` server-side using your secret key via the Fincra API, then pass the URL to the SDK.
> - For **Inline Checkout**: Only your **public key** (`pk_...`) is used. This is safe to bundle.
>
> Storing secret keys in client code exposes them to reverse engineering and can lead to fraudulent transactions.
>
> **Expo users:** every `EXPO_PUBLIC_*` environment variable is inlined into the JS bundle. Never give your secret key that prefix.

## ⚠️ Verify every payment server-side

> The SDK result is a **UX signal, not proof of payment.** A redirect or a JS callback can be missing data or be tampered with on the device, and in WebView mode a redirect **without** a `status` / `payment_status` parameter is reported as `success` (the Fincra sandbox omits it).
>
> **Before fulfilling an order, always verify the transaction on your backend** — via the Fincra API (look up the `reference`) or your Fincra webhook.

---

## Creating a hosted checkout link (server-side)

WebView mode needs a hosted checkout link, created **on your server** with your secret key:

```http
POST https://sandboxapi.fincra.com/checkout/payments   (production: https://api.fincra.com/checkout/payments)
api-key: <your SECRET key>
x-pub-key: <your PUBLIC key>
content-type: application/json

{
  "amount": 5000,
  "currency": "NGN",
  "customer": { "name": "Jane Doe", "email": "jane@example.com" },
  "redirectUrl": "https://api.yourapp.com/payment/callback",
  "reference": "ORDER-001",        // optional
  "feeBearer": "business"          // optional
}
```

The link is in the response at `data.link`. Return it to the app and pass it as `checkoutUrl`, with the same `redirectUrl`. The example app ships a script for this: `cd example && npm run checkout-link`.

---

## Setup — Add the Host Component

Add `<FincraCheckoutHost />` **once** at your app root. This enables the imperative `FincraCheckout.open*()` API:

```tsx
// App.tsx
import { FincraCheckoutHost } from 'react-native-fincra-checkout';

export default function App() {
  return (
    <>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>

      {/* ← Add this once at the end of your root component */}
      <FincraCheckoutHost />
    </>
  );
}
```

> **Note**: The host renders nothing until a checkout is opened. It must be inside a rendered component tree (not a provider).

---

## WebView vs. Inline — Comparison

| Feature | WebView Checkout | Inline JS Checkout |
|---|---|---|
| **Trigger** | Backend-generated URL | Public key + params |
| **Key required** | Secret key *(server-side only)* | Public key *(client-safe)* |
| **Payment flow** | Full Fincra-hosted page | Embedded Fincra JS widget |
| **URL interception** | ✅ Redirect URL or query params | ❌ N/A (JS bridge events) |
| **Init timeout** | ❌ N/A | ✅ 15 seconds |
| **Recommended for** | Production (most secure) | Frontend-only prototypes |

---

## Usage

### A. Imperative API (Promise / async-await)

#### WebView Mode — recommended

```tsx
import { FincraCheckout } from 'react-native-fincra-checkout';

async function handlePayment() {
  const result = await FincraCheckout.openWebView({
    // Generated by your backend using Fincra API + secret key
    checkoutUrl: 'https://checkout.fincra.com/pay/abc123',
    // Your backend redirect URL — intercepted by the SDK
    redirectUrl: 'https://api.yourapp.com/payment/callback',
    headerTitle: 'Complete Payment',
    showCancelConfirmationDialog: true,
  });

  switch (result.type) {
    case 'success':
      console.log('Payment successful:', result.response.reference);
      break;
    case 'error':
      console.error('Payment failed:', result.error.message);
      break;
    case 'cancelled':
      console.log('User cancelled the payment');
      break;
  }
}
```

#### Inline Mode

```tsx
import { FincraCheckout } from 'react-native-fincra-checkout';

async function handleInlinePayment() {
  const result = await FincraCheckout.openInline({
    publicKey: 'pk_live_xxxxxxxxxxxx',
    amount: 5000,          // in smallest currency unit (e.g., kobo for NGN)
    currency: 'NGN',
    customerEmail: 'customer@example.com',
    customerName: 'Jane Doe',
    customerPhoneNumber: '08012345678', // optional
    feeBearer: 'customer',
    reference: 'ORDER-001', // optional — Fincra generates one if omitted
    paymentMethods: ['card', 'bank_transfer'], // optional
  });

  if (result.type === 'success') {
    const { reference, transactionId, status } = result.response;
    console.log({ reference, transactionId, status });
  }
}
```

---

### B. Declarative Component API

Embed checkout views directly inside your own modals, bottom sheets, or navigation screens:

#### `<FincraWebViewCheckout />`

```tsx
import { FincraWebViewCheckout } from 'react-native-fincra-checkout';

function PaymentScreen() {
  return (
    <FincraWebViewCheckout
      checkoutUrl="https://checkout.fincra.com/pay/abc123"
      redirectUrl="https://api.yourapp.com/payment/callback"
      headerTitle="Secure Payment"
      headerBackgroundColor="#0066FF"
      headerTintColor="#FFFFFF"
      showCancelConfirmationDialog
      onSuccess={(response) => {
        console.log('Success:', response.reference);
        navigation.navigate('PaymentSuccess');
      }}
      onFailed={(error) => {
        console.error('Error:', error.message);
      }}
      onCancelled={() => {
        navigation.goBack();
      }}
    />
  );
}
```

#### `<FincraInlineCheckout />`

```tsx
import { FincraInlineCheckout } from 'react-native-fincra-checkout';

function InlinePaymentScreen() {
  return (
    <FincraInlineCheckout
      publicKey="pk_live_xxxxxxxxxxxx"
      amount={10000}
      currency="NGN"
      customerEmail="customer@example.com"
      customerName="John Doe"
      feeBearer="business"
      onSuccess={(response) => console.log(response)}
      onFailed={(error) => console.error(error)}
      onCancelled={() => navigation.goBack()}
    />
  );
}
```

---

## TypeScript Types

```typescript
import type {
  FincraCheckoutResult,
  FincraPaymentResponse,
  FincraPaymentError,
  WebViewCheckoutConfig,
  InlineCheckoutConfig,
  FincraCurrency,
  FeeBearer,
} from 'react-native-fincra-checkout';

// Discriminated union result
type FincraCheckoutResult =
  | { type: 'success'; response: FincraPaymentResponse }
  | { type: 'error'; error: FincraPaymentError }
  | { type: 'cancelled' };
```

### Supported Currencies

`NGN` · `USD` · `GBP` · `EUR` · `GHS` · `KES` · `ZAR` · `UGX` · `XAF` · `XOF`

---

## Props Reference

### Shared (`BaseCheckoutProps`)

| Prop | Type | Default | Description |
|---|---|---|---|
| `onSuccess` | `(response) => void` | — | Called on successful payment |
| `onFailed` | `(error) => void` | — | Called on payment error |
| `onCancelled` | `() => void` | — | Called when user cancels |
| `headerTitle` | `string` | `'Secure Checkout'` | Navigation bar title |
| `headerBackgroundColor` | `string` | `'#FFFFFF'` | Nav bar background color |
| `headerTintColor` | `string` | `'#000000'` | Nav bar text/icon color |
| `showCancelConfirmationDialog` | `boolean` | `false` | Show Alert before closing |
| `loadingComponent` | `ReactNode` | `ActivityIndicator` | Custom loading spinner |
| `showCloseButton` | `boolean` | `true` | Show the ✕ in the header. If hidden, iOS users can't leave while the page loads or hangs (the error screen's Cancel and Android back still work) |
| `closeIcon` | `ReactNode` | `✕` text | Custom close button content |
| `renderError` | `(error, retry) => ReactNode` | built-in | Custom load-error screen |

### `WebViewCheckoutConfig`

| Prop | Type | Required | Description |
|---|---|---|---|
| `checkoutUrl` | `string` | ✅ | Backend-generated Fincra checkout URL |
| `redirectUrl` | `string` | — | Redirect URL to intercept for completion |

### `InlineCheckoutConfig`

| Prop | Type | Required | Description |
|---|---|---|---|
| `publicKey` | `string` | ✅ | Your Fincra public key (`pk_...`) |
| `amount` | `number` | ✅ | Amount to charge (a number, not a string) |
| `currency` | `FincraCurrency` | ✅ | Payment currency |
| `customerEmail` | `string` | ✅ | Customer email |
| `customerName` | `string` | ✅ | Customer full name |
| `customerPhoneNumber` | `string` | — | Customer phone number. Trimmed; omitted from the request when blank |
| `feeBearer` | `FeeBearer` | ✅ | `'business'` or `'customer'` |
| `reference` | `string` | — | Custom transaction reference |
| `paymentMethods` | `string[]` | — | Restrict to specific methods |

---

## How URL Interception Works

The WebView mode intercepts navigation requests:

1. **If `redirectUrl` is set**, a URL completes the checkout only if it matches strictly:
   - same scheme, host (case-insensitive) and port (`:443` / `:80` defaults normalised);
   - path equal to the redirect path, or continuing it at a `/` (`/callback`, `/callback/`, `/callback/done` match; `/callbacks-other` does not);
   - query string and fragment are ignored; a redirect URL with no path matches any path on that host.

   Lookalike hosts such as `https://myapp.com.evil.io/callback` never match.
2. **Fallback** (no `redirectUrl`): completion is detected when both `status` (or `payment_status`) **and** `reference` query params are present.

The status is read from `status`, falling back to `payment_status`. `success` / `successful` → `onSuccess`; any other value → `onFailed` with `code` = the status and `message` = the `message` param (or `'Payment failed'`). A **missing** status is treated as success — see **Verify every payment server-side** above.

Page-load errors (main frame only) show a Retry / Cancel screen; they never report the payment as failed.

Response parameters are normalized:
- `customerReference` → `reference` (preferred)
- `merchantReference` → `reference` (fallback)
- `transactionReference` → `transactionId`

---

## Running Tests

```bash
npm test
```

Tests cover `UrlHandler` (strict redirect matching, status extraction, reference normalization), `JsBridge` (event parsing, data normalization), the inline HTML/options builder, and the checkout components and host (settle-once, late callbacks, back button) — no device or emulator required.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a list of release notes and changes.

---

## License

MIT © [Fincra](https://fincra.com)
