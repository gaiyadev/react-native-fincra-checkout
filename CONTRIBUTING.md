# Contributing to react-native-fincra-checkout

Thanks for helping improve this SDK! Bug reports, fixes, docs and features are all welcome.

This is a **community-maintained** project. It is not affiliated with, endorsed by, or supported by Fincra. For questions about the Fincra platform or API itself, contact Fincra.

By participating, you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

> **Found a security vulnerability?** Do **not** open a public issue. Follow [SECURITY.md](./SECURITY.md) instead.

---

## Ways to contribute

- **Report a bug**: open an issue using the *Bug report* template. A minimal reproduction makes it much faster to fix.
- **Suggest a feature**: open an issue using the *Feature request* template before writing a large change, so we can agree on the approach.
- **Improve the docs**: typo fixes and clarifications can go straight to a pull request.
- **Fix an issue**: look for issues labelled `good first issue` or `help wanted`, and comment that you're working on it.

## Development setup

### Prerequisites

- Node.js **20 or newer** and npm
- For the example app: Xcode (iOS Simulator) and/or Android Studio (emulator), or the Expo Go app on a device

### Install and check

```bash
git clone https://github.com/gaiyadev/react-native-fincra-checkout.git
cd react-native-fincra-checkout
npm ci

npm test           # Jest unit and component tests
npm run lint       # ESLint
npm run typecheck  # TypeScript (strict)
npm run build      # Compile to lib/ (CommonJS + type declarations)
```

CI runs all four on every push and pull request, and they must pass before a PR can be merged.

### Running the example app

The [`example/`](./example) Expo app uses the SDK directly from `src/`, so your changes show up immediately.

```bash
cd example
npm install
cp .env.example .env   # then fill in your Fincra sandbox keys
npm run checkout-link  # creates a hosted checkout link server-side (needs the secret key)
npm start              # press i for iOS or a for Android
```

Paste the printed link into `EXPO_PUBLIC_FINCRA_CHECKOUT_URL` in `.env`, or into the URL field in the app.

## Project layout

```
src/
  checkout/     FincraCheckout imperative API and FincraCheckoutHost (modal)
  components/   FincraWebViewCheckout and FincraInlineCheckout screens
  inline/       HTML/options builder and JS-bridge message parser (inline mode)
  utils/        UrlHandler: redirect matching and status/param extraction
  types/        Public types
  index.ts      Public entry point: anything exported here is public API
__tests__/      Jest tests (setup.js holds the shared mocks)
example/        Expo example app
```

## Making changes

### Tests

- **Every bug fix needs a regression test** that fails without the fix.
- **New behaviour needs tests**, and pure logic (`utils/`, `inline/`) should be unit-tested directly.
- Shared Jest mocks live in [`__tests__/setup.js`](./__tests__/setup.js): `react-native-webview`, `react-native-safe-area-context` and `StatusBar`.
- When a test uses **fake timers**, enable them inside that test and restore them in a `finally` block:

  ```ts
  jest.useFakeTimers();
  try {
    // ...
  } finally {
    jest.useRealTimers();
  }
  ```

  Don't enable fake timers globally: tests that switch between fake and real timers have caused cleanup hangs on Node 18/20.

### Public API

Anything exported from [`src/index.ts`](./src/index.ts) is public. Avoid breaking changes. If one is unavoidable, explain it in the PR and the CHANGELOG, because it requires a major version bump.

### Code style

- TypeScript in strict mode, and ESLint must pass (`npm run lint`).
- Match the style of the surrounding code: naming, comment density and structure.
- Keep components free of payment logic where possible, so it can be unit-tested in `utils/` or `inline/`.

### Security rules

- **Never commit keys or `.env` files.** Only the Fincra **public** key (`pk_...`) may appear in app code.
- In Expo, every `EXPO_PUBLIC_*` variable is bundled into the app. The **secret** key must never use that prefix.
- Any value embedded in the inline checkout page must go through the existing safe encoding in `src/inline/htmlGenerator.ts`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
fix: read payment_status when status is missing
feat: add showCloseButton prop
docs: clarify hosted link creation
test: cover lookalike redirect hosts
chore: bump dev dependencies
ci: cache npm in workflow
```

Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.

## Pull requests

1. Fork the repo and create a branch from `main` (for example `fix/redirect-port`).
2. Keep each PR to **one topic**. Several small PRs are easier to review than one large one.
3. Add or update tests and docs (README) as needed.
4. Add a line under `## [Unreleased]` in [CHANGELOG.md](./CHANGELOG.md).
5. Make sure `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` pass.
6. Open the PR and fill in the template. Link the issue it fixes (`Fixes #123`).

A maintainer will review it. Please be patient: this project is maintained by volunteers.

## Releasing (maintainers)

1. Move the `[Unreleased]` CHANGELOG entries under a new version heading with the date.
2. Bump `version` in `package.json` (semver: fixes → patch, features → minor, breaking → major).
3. Merge to `main` and wait for CI to pass.
4. Tag and publish from an up-to-date `main`:

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   npm publish            # `prepare` builds lib/ automatically
   ```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
