# toucan-js

## 3.2.0

### Minor Changes

- 58abdc4: You can now wrap fetch by passing fetcher to transportOptions.
- 87e50c9: Add setEnabled method
- 66f08ca: The following integrations are now re-exported from `toucan-js` for type compatibility: `Dedupe`, `ExtraErrorData`, `RewriteFrames`, `SessionTiming`, `Transaction`.

### Patch Changes

- ec953a9: Update sentry-javascript monorepo to v7.43.0
- df4eeea: Update sentry-javascript monorepo to v7.42.0
- 86c2be8: Update dependency miniflare to v2.12.1
- 17b22f1: Update dependency rollup to v3.19.1
- cde3c15: Update dependency @rollup/plugin-commonjs to v24
- ac869b6: Update dependency @rollup/plugin-commonjs to v23.0.7
- d697e6f: Update dependency ts-jest to v29.0.5
- c478f14: Update dependency @rollup/plugin-replace to v5.0.2

## 3.1.0

### Minor Changes

- 5f6cea5: Update Sentry dependencies to 7.28.1

## 3.0.0

### Major Changes

- adf151f: This is a complete rewrite of `toucan-js`. The goal of this update is to reuse more components from [@sentry/core](https://github.com/getsentry/sentry-javascript/tree/master/packages/core), fix long-standing issues with source maps, and provide starters using various bundlers (esbuild, rollup, vite, webpack).

  The good news is that `toucan-js` now supports pretty much all SDK options and methods provided in official Sentry SDKs for JavaScript that you all are used to and love.

  The bad news is that I may fail to document all breaking changes, because `toucan-js` now delegates to a lot of code written by someone else. So use this release with caution. :)

  - All methods and options available on [Hub](https://github.com/getsentry/sentry-javascript/blob/master/packages/core/src/hub.ts) that previously weren't available or didn't work are now supported. This includes integrations!
    - On integrations: some integrations from [@sentry/integrations](https://github.com/getsentry/sentry-javascript/tree/master/packages/integrations) might not work because they use globals, or modify global runtime methods (such as console.log). Refer to [README file](https://github.com/robertcepa/toucan-js) that documents all supported integrations.
  - This monorepo now provides quick starts written in TypeScript, with [source maps](https://docs.sentry.io/platforms/javascript/sourcemaps/) support and local live reloading experience using [open source Cloudflare Workers runtime](https://github.com/cloudflare/workerd).

    - [wrangler-basic](examples/wrangler-basic/)
    - [wrangler-esbuild](examples/wrangler-esbuild/)
    - [wrangler-rollup](examples/wrangler-rollup/)
    - [wrangler-vite](examples/wrangler-vite/)
    - [wrangler-webpack](examples/wrangler-webpack/)

  - `Toucan` client is no longer a default export. It is now a named export.

  Before:

  ```typescript
  import Toucan from 'toucan-js';
  ```

  After:

  ```typescript
  import { Toucan } from 'toucan-js';
  ```

  - `OtherOptions` type has been removed. Use `Options` type instead. `Options` type isn't a discriminated union anymore and contains all types.

  - `event` option has been removed. Use `context` option instead.
  - `context.request` is no longer used to track request data. If you want to track request data, use top-level `request` option instead.
  - `allowedCookies`, `allowedHeaders`, `allowedSearchParams` are no longer top level options, but options on new `RequestData` integration that is exported from the SDK. The Toucan client provides a shortcut for these options as `requestDataOptions` top level option. To migrate, either move them to `requestDataOptions`, or pass them to `RequestData` integration. Additionally, they now support boolean values, where `true` allows everything, and `false` denies everything.

  Before:

  ```typescript
  import Toucan from 'toucan-js';

  const sentry = new Toucan({
    dsn: '...',
    context,
    allowedCookies: ['myCookie'],
    allowedHeaders: ['user-agent'],
    allowedSearchParams: ['utm-source'],
  });
  ```

  After (option 1):

  ```typescript
  import { Toucan } from 'toucan-js';

  const sentry = new Toucan({
    dsn: '...',
    context,
    requestDataOptions: {
      allowedCookies: ['myCookie'],
      allowedHeaders: ['user-agent'],
      allowedSearchParams: ['utm-source'],
    },
  });
  ```

  After (option 2):

  ```typescript
  import { Toucan, RequestData } from 'toucan-js';

  const sentry = new Toucan({
    dsn: '...',
    context,
    integrations: [new RequestData({{
      allowedCookies: ['myCookie'],
      allowedHeaders: ['user-agent'],
      allowedSearchParams: ['utm-source'],
    }})],
  });
  ```

  - `tracesSampleRate` and `tracesSampler` options no longer affect Sentry events. They only affect transactions. If you want to sample sentry events, use `sampleRate` option. Refer to https://docs.sentry.io/platforms/javascript/configuration/sampling/ for more information.
  - `pkg` option has been removed.
  - `rewriteFrames` option has been removed. To migrate, use `RewriteFrames` integration from [@sentry/integrations](https://github.com/getsentry/sentry-javascript/tree/master/packages/integrations).

  Before

  ```typescript
  import Toucan from 'toucan-js';

  const sentry = new Toucan({
    dsn: '...',
    context,
    rewriteFrames: {
      root: '/',
    },
  });
  ```

  After

  ```typescript
  import { RewriteFrames } from '@sentry/integrations';
  import { Toucan } from 'toucan-js';

  const sentry = new Toucan({
    dsn: '...',
    context,
    integrations: [new RewriteFrames({ root: '/' })],
  });
  ```
