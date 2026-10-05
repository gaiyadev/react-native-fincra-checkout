# Security Policy

This SDK sits in a payment flow, so we take security reports seriously. Thank you for helping keep its users safe.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |
| < 1.0 | ❌ |

Security fixes are released as patch versions of the latest minor release.

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, discussions or pull requests.**

Report them privately through GitHub:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Include:
   - the affected version(s), platform (iOS/Android) and checkout mode (WebView or Inline);
   - a description of the issue and its impact;
   - steps or a minimal proof of concept to reproduce it;
   - any suggested fix, if you have one.

**Never include real API keys, secret keys or customer data** in a report. Use sandbox keys and test data.

### What to expect

- We aim to acknowledge your report within **7 days**. This is a volunteer-maintained project, so timelines are best effort.
- We'll confirm the issue, work on a fix, and keep you updated in the private advisory.
- Once a fix is released, we'll publish a GitHub Security Advisory and credit you, unless you prefer to stay anonymous.

## Scope

**In scope:** this SDK's code in this repository. For example:
- a redirect URL or payment result that can be spoofed;
- code injection into the inline checkout page;
- a payment reported with the wrong outcome;
- leakage of keys or payment data by the SDK.

**Out of scope:**
- **The Fincra platform, API or hosted checkout pages.** Report those to Fincra directly. This project is not affiliated with Fincra.
- Vulnerabilities in third-party dependencies with no demonstrated impact on this SDK (report those upstream).
- Problems caused by an integration that ignores the guidance below.

## Guidance for integrators

- **Keep your Fincra secret key on your server.** Only the public key (`pk_...`) belongs in an app. In Expo, any `EXPO_PUBLIC_*` variable is bundled into the app, so never give your secret key that prefix.
- **Verify every payment server-side** (Fincra API or webhook) before fulfilling an order. The SDK's success/error result is a UX signal, not proof of payment.
- Always pass a `redirectUrl` in WebView mode so completion is matched strictly against your URL.
- Keep the SDK up to date to receive security fixes.
