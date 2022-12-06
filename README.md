<p align="center">
  <img src="https://i.imgur.com/zHw4F3x.jpg" alt="Logo" height="300">
</p>

[![npm version](https://img.shields.io/npm/v/toucan-js)](https://www.npmjs.com/package/toucan-js)
[![npm version](https://img.shields.io/npm/dw/toucan-js)](https://www.npmjs.com/package/toucan-js)
[![npm version](https://img.shields.io/npm/types/toucan-js)](https://www.npmjs.com/package/toucan-js)

# toucan-js

**Toucan** is a [Sentry](https://docs.sentry.io/) client for [Cloudflare Workers](https://developers.cloudflare.com/workers/) written in TypeScript.

- **Reliable**: In Cloudflare Workers isolate model, it is inadvisable to [set or mutate global state within the event handler](https://developers.cloudflare.com/workers/about/how-it-works). Toucan was created with Workers' concurrent model in mind. No race-conditions, no undelivered logs, no nonsense metadata in Sentry.
- **Flexible:** Supports `fetch` and `scheduled` Workers, their `.mjs` equivalents, and `Durable Objects`.
- **Familiar API:** Follows [Sentry unified API guidelines](https://develop.sentry.dev/sdk/unified-api/).

## Documentation

See [toucan-js](packages/toucan-js/) package.

## Examples

This repository provides starters written in TypeScript, with [source maps](https://docs.sentry.io/platforms/javascript/sourcemaps/) support and local live reloading experience using [open source Cloudflare Workers runtime](https://github.com/cloudflare/workerd).

- [wrangler-basic](examples/wrangler-basic/)
- [wrangler-esbuild](examples/wrangler-esbuild/)
- [wrangler-rollup](examples/wrangler-rollup/)
- [wrangler-vite](examples/wrangler-vite/)
- [wrangler-webpack](examples/wrangler-webpack/)
