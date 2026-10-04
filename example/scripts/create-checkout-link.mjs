#!/usr/bin/env node
// ─── Create a Fincra hosted checkout link (server-side) ───────────────────────
//
// Run from `example/`:  npm run checkout-link
// (= node --env-file=.env scripts/create-checkout-link.mjs, Node >= 20.6)
//
// This uses your SECRET key, so it must run on a server or your machine —
// never in the app. Paste the printed link into EXPO_PUBLIC_FINCRA_CHECKOUT_URL
// in `.env`, or into the example app's checkout URL field.
//
// API: POST https://sandboxapi.fincra.com/checkout/payments
//   headers: api-key (secret), x-pub-key (public), content-type: application/json
//   body:    { amount, currency, customer: { name, email }, redirectUrl,
//              reference?, feeBearer? }
//   result:  data.link

const API_URL = 'https://sandboxapi.fincra.com/checkout/payments';

const secretKey = process.env.FINCRA_SANDBOX_API_KEY;
const publicKey = process.env.EXPO_PUBLIC_FINCRA_SANDBOX_PUB_KEY;
const redirectUrl =
  process.env.EXPO_PUBLIC_FINCRA_REDIRECT_URL || 'https://myapp.com/callback';

if (!secretKey || !publicKey) {
  console.error(
    'Missing FINCRA_SANDBOX_API_KEY or EXPO_PUBLIC_FINCRA_SANDBOX_PUB_KEY in .env'
  );
  process.exit(1);
}

const response = await fetch(API_URL, {
  method: 'POST',
  headers: {
    accept: 'application/json',
    'api-key': secretKey,
    'x-pub-key': publicKey,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    amount: 5000,
    currency: 'NGN',
    customer: { name: 'Customer Name', email: 'customer@example.com' },
    redirectUrl,
    reference: `ORDER-${Date.now()}`,
    feeBearer: 'business',
  }),
});

const body = await response.json().catch(() => ({}));
const link = body?.data?.link;

if (!response.ok || !link) {
  console.error(
    `Failed to create checkout link (HTTP ${response.status}):`,
    body?.message ?? body
  );
  process.exit(1);
}

console.log(link);
