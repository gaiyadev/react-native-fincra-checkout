# Changelog

All notable changes to `react-native-fincra-checkout` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
