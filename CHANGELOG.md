# Changelog

All notable changes to `react-native-fincra-checkout` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open-source project files: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private vulnerability reporting), GitHub issue/PR templates and Dependabot config.

### Changed
- Package `author` and license holder corrected to Codeloom Technologies. The README now states that this is a community SDK, not affiliated with or endorsed by Fincra.
- The `LICENSE` file now ships in the npm package.

## [1.0.2] - 2026-10-04

### Security
- **Example app no longer ships the secret key.** It was read from `EXPO_PUBLIC_FINCRA_SANDBOX_API_KEY`, and Expo inlines every `EXPO_PUBLIC_*` variable into the JS bundle. It is now `FINCRA_SANDBOX_API_KEY`, used only by a server-side script (`npm run checkout-link`). The app only uses the public key. **Earlier commits contained the sandbox secret key; rotate it.**
- **Injection-safe inline page.** Options are now embedded with `<`, `>`, `&`, U+2028 and U+2029 escaped, so a value containing `</script>` can no longer break out of the generated script.
- `.env.*` is now gitignored. `.env.example` files are kept.

### Fixed — WebView checkout
- **`payment_status` is now honoured.** A redirect with `?payment_status=failed&reference=…` was reported as **success**, because only `status` was read. New `UrlHandler.extractStatus()` reads `status`, falling back to `payment_status`. Any status other than `success`/`successful` calls `onFailed` (code = status, message = `message` param or `'Payment failed'`). A missing status is still treated as success, so verify every payment server-side.
- **Strict redirect URL matching.** `startsWith` let `https://google.com.evil.io/…` match `https://google.com`. Matching now requires the same scheme, host (case-insensitive) and port (defaults normalised), and the path must match at a `/` boundary. Query and fragment are ignored.
- **Settles once; ignores callbacks after unmount.** Every result goes through a single `settle()` guarded by `isMounted` and `settled` refs. This includes the cancel-confirmation "Yes" pressed after the screen is gone.
- **Load errors.** react-native-webview already reports only main-frame errors. Errors for the (blocked) redirect URL and errors after settlement are now ignored too. HTTP errors use `statusCode` as the error code. Load errors never report the payment as failed.

### Fixed — Inline checkout
- **`customerPhoneNumber` is optional.** It is trimmed, and when it is missing or blank the `phoneNumber` key is left out of `customer` entirely. Previously it was sent as `null`/`""`. The options are built by a pure, internal `buildInlineOptions()`.
- **A `success` event without data is a success.** It was reported as **cancelled**, hiding a real payment. It now resolves as success with empty references.
- **Success data is normalised.** Nested objects/arrays are JSON-encoded instead of becoming `"[object Object]"`, and `null` values are dropped instead of becoming `"null"`. `status` defaults to `'success'`.
- **Late messages / Android back.** Bridge messages after the session settled or the component unmounted are ignored.
- **Retry re-arms the 15s load timeout.** Previously the timeout only ran once per mount.

### Fixed — `FincraCheckoutHost`
- **Header under the status bar / Dynamic Island on iOS.** `SafeAreaView` reads insets from the nearest `SafeAreaProvider`, and the checkout `Modal` had none, so the insets were 0 and taps on the ✕ were swallowed by the system. Both checkout screens now wrap themselves in a `SafeAreaProvider`.
- **Android back (`Modal onRequestClose`) settles the session once.** Each `open*()` call has its own session id, and a late result from the page can no longer call the merchant's callbacks a second time (e.g. popping the host app's own screen).

### Added
- `showCloseButton` prop (default `true`) on both checkout components and `FincraCheckout.open*()` to hide the header ✕.

### Changed
- Example app: reads the public key, hosted checkout URL and redirect URL from `.env` (`EXPO_PUBLIC_*`). It has a field for pasting a fresh link, and runs inline checkout without a phone number. New `scripts/create-checkout-link.mjs` creates the hosted link server-side.
- README: phone number optional; strict redirect matching documented; how to create a hosted link; new **"Verify every payment server-side"** section; fixed the invalid `FincraCheckoutResult` snippet.

## [1.0.1] - 2026-07-31

### Added
- **Production Hardening**: Migrated safe-area handling to `react-native-safe-area-context` (`SafeAreaView`) for improved notch and dynamic island compatibility across iOS and Android.
- **Error Recovery UI**: Added interactive retry and fallback options in checkout views when network requests or WebView loading fail.
- **Environment Variable Configuration**: Moved sandbox API keys to environment variables (`.env`) in the example application to prevent hardcoding credentials.
- **Comprehensive Testing**: Added full component test suites for `FincraWebViewCheckout`, `FincraInlineCheckout`, `UrlHandler`, and `JsBridge` with 100% test pass rate (64 tests).
- **CI & Quality Tools**: Integrated GitHub Actions CI workflow and ESLint configuration.

### Fixed
- **ESLint & React Compiler**: Resolved all ESLint warnings and React Compiler lint rules across source components and tests.
- **Jest Timers**: Scoped fake timers in `FincraInlineCheckout` timeout tests to prevent `afterEach` cleanup timeouts.
- **Metro Monorepo Resolution**: Fixed Metro configuration in example app to resolve React and React Native subpath resolution (`ReactCurrentDispatcher` and duplicate runtime errors).
- **Runtime Exports**: Exported `FincraCurrency` and `FeeBearer` as runtime `const` objects for improved developer ergonomics and compatibility.
- **Payment Methods**: Removed unavailable `payattitude` method from NGN payment options in the example app to avoid Fincra API 400 errors.

### Changed
- **Documentation**: Updated `README.md` with complete installation instructions for `react-native-safe-area-context` and detailed error recovery feature guides.
- **Package Metadata**: Normalized repository URLs, bug tracker links, and homepage references in `package.json` for npm publication.

## [1.0.0] - 2026-07-28

### Added
- Initial release of `react-native-fincra-checkout`.
- **WebView Mode** (`FincraWebViewCheckout`): Hosted checkout page integration via React Native WebView.
- **Inline JavaScript Mode** (`FincraInlineCheckout`): Direct widget integration via Fincra's inline JS SDK.
- **TypeScript Support**: Complete TypeScript type definitions for props, payment requests, responses, and errors.
- **Example App**: Included a functional Expo / React Native example application demonstrating standard checkout flows.
