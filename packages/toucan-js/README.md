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

## Features

This SDK provides all options and methods of [Hub](https://github.com/getsentry/sentry-javascript/blob/master/packages/core/src/hub.ts) and additionally:

### Additional constructor options

| Option             | Type               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| context            | Context            | This can be any object that contains [waitUntil](https://developers.cloudflare.com/workers/about/tips/fetch-event-lifecycle/). It can be [FetchEvent](https://developers.cloudflare.com/workers/runtime-apis/fetch-event), [ScheduledEvent](https://developers.cloudflare.com/workers/runtime-apis/scheduled-event), [DurableObjectState](https://developers.cloudflare.com/workers/runtime-apis/durable-objects), or [.mjs context](https://community.cloudflare.com/t/2021-4-15-workers-runtime-release-notes/261917). |
| request            | Request            | If set, the SDK will send information about incoming requests to Sentry. By defailt, only the request method and request origin + pathname are sent. If you want to include more data, you need to use `requestDataOptions` option.                                                                                                                                                                                                                                                                                      |
| requestDataOptions | RequestDataOptions | Object containing allowlist for specific parts of request. Refer to sensitive data section below.                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Additional methods

- `Toucan.setRequestBody(body: unknown): void`: Attaches request body to future events. `body` can be anything serializable.

## Integrations

You can use custom integrations to enhance `toucan-js` as you would any other Sentry SDK. Some integrations are provided in [@sentry/integrations](https://github.com/getsentry/sentry-javascript/tree/master/packages/integrations) package, and you can also write your own! To ensure an integration will work properly in `toucan-js`, it must:

- not use global `getCurrentHub` from `@sentry/core`.
- not enhance or wrap global runtime methods (such as `console.log`).
- not use runtime APIs that aren't available in Cloudflare Workers (NodeJS runtime functions, `window` object, etc...).

Supported integrations from [@sentry/integrations](https://github.com/getsentry/sentry-javascript/tree/master/packages/integrations):

- [Dedupe](https://github.com/getsentry/sentry-javascript/blob/master/packages/integrations/src/dedupe.ts)
- [ExtraErrorData](https://github.com/getsentry/sentry-javascript/blob/master/packages/integrations/src/extraerrordata.ts)
- [RewriteFrames](https://github.com/getsentry/sentry-javascript/blob/master/packages/integrations/src/rewriteframes.ts)
- [SessionTiming](https://github.com/getsentry/sentry-javascript/blob/master/packages/integrations/src/sessiontiming.ts)
- [Transaction](https://github.com/getsentry/sentry-javascript/blob/master/packages/integrations/src/transaction.ts)

`toucan-js` also provides 2 integrations that are enabled by default, but are provided if you need to reconfigure them:

- [LinkedErrors](src/integrations/linkedErrors.ts)
- [RequestData](src/integrations/requestData.ts)

### Custom integration example:

```ts
import { Toucan } from 'toucan-js';
import { RewriteFrames } from '@sentry/integrations';

type Env = {
  SENTRY_DSN: string;
};

export default {
  async fetch(request, env, context): Promise<Response> {
    const sentry = new Toucan({
      dsn: env.SENTRY_DSN,
      context,
      request,
      integrations: [new RewriteFrames({ root: '/' })],
    });

    ...
  },
} as ExportedHandler<Env>;
```

## Sensitive data

By default, Toucan does not send any request data that might contain [PII (Personally Identifiable Information)](https://docs.sentry.io/data-management/sensitive-data/) to Sentry.

This includes:

- request headers
- request cookies
- request search params
- request body
- user's IP address (read from `CF-Connecting-Ip` header)

You will need to explicitly allow these data using:

- `allowedHeaders` option (array of headers or Regex or boolean)
- `allowedCookies` option (array of cookies or Regex or boolean)
- `allowedSearchParams` option (array of search params or Regex or boolean)
- `allowedIps` option (array of search params or Regex or boolean)

These options are available on [RequestData](src/integrations/requestData.ts) integration or `requestDataOptions` option (which is passed down to [RequestData](src/integrations/requestData.ts) automatically).
