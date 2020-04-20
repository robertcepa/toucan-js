<p align="center">
  <img src="https://i.imgur.com/zHw4F3x.jpg" alt="Logo" height="300">
</p>

[![npm version](https://img.shields.io/npm/v/toucan-js)](https://www.npmjs.com/package/toucan-js)
[![npm version](https://img.shields.io/npm/dw/toucan-js)](https://www.npmjs.com/package/toucan-js)
[![npm version](https://img.shields.io/npm/types/toucan-js)](https://www.npmjs.com/package/toucan-js)

# toucan-js

Toucan is a reliable [Sentry](https://docs.sentry.io/) client for [Cloudflare Workers](https://developers.cloudflare.com/workers/). Follows [Sentry unified API guidelines](https://docs.sentry.io/development/sdk-dev/unified-api/).

## Motivation

In Cloudflare Workers isolate model, it is inadvisable to [set or mutate global state within the event handler](https://developers.cloudflare.com/workers/about/how-it-works). The most of JavaScript SDKs use static methods that mutate global state with request metadata, breadcrumbs, tags... This is reasonable, because they were implemented for environments where concurrency does not inherently exist. However, using these SDKs in Workers leads to race conditions, such as logging breadcrumbs and request metadata of interleaved events.

Toucan was created with Workers concurrent model in mind. Being a JavaScript class instantiated per-event, this kind of race-conditions do not exist, because all request metadata are scoped to a particular fetch event.

## Usage

```
npm install --save toucan-js
```

`worker.ts`

```ts
import Toucan from "toucan-js";

addEventListener("fetch", (event) => {
  const sentry = new Toucan({
    dsn: "dsn...",
    event,
    whitelistedHeaders: ["user-agent"],
    whitelistedSearchParams: /(.*)/,
  });

  sentry.setUser({ id: "1234" });

  event.respondWith(doStuff(event, sentry));
});

async function doStuff(event: FetchEvent, sentry: Toucan) {
  try {
    sentry.addBreadcrumb({
      message: "About to do some I/O...",
      category: "log",
    });
    // do some I/O
    return new Response("OK", {
      status: 200,
    });
  } catch (err) {
    sentry.captureException(err);
    return new Response("", {
      status: 200,
      statusText: "OK",
    });
  }
}
```

## Features

- addBreadcumb: Records a new breadcrumb which will be attached to future events.
- captureException: Captures an exception event and sends it to Sentry.
- captureMessage: Captures a message event and sends it to Sentry.
- setRequestBody: Records incoming request's body which will be attached to future events.
- setTag: Set key:value that will be sent as tags data with the event.
- setTags: Set an object that will be merged sent as tags data with the event.
- setUser: Updates user context information for future events.

## Options

| Option                  | Type                    | Description                                                                                                                                                         |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dsn                     | \*string                | Sentry [Data Source Name](https://docs.sentry.io/error-reporting/quickstart/?platform=javascript#configure-the-sdk).                                                |
| event                   | \*FetchEvent            | Workers fetch event. Toucan needs this to be able to call [waitUntil](https://developers.cloudflare.com/workers/about/tips/fetch-event-lifecycle/).                 |
| environment             | string                  | Your application's environment (production/staging/...).                                                                                                            |
| release                 | string                  | Release tag.                                                                                                                                                        |
| pkg                     | object                  | Essentially your package.json. Toucan will use it to read project name, version, dependencies, and devDependencies.                                                 |
| whitelistedHeaders      | string[] \| RegExp      | Array of whitelisted headers, or a regular expression used to whitelist headers of incoming request. If not provided, headers will not be logged.                   |
| whitelistedCookies      | string[] \| RegExp      | Array of whitelisted cookies, or a regular expression used to whitelist cookies of incoming request. If not provided, cookies will not be logged.                   |
| whitelistedSearchParams | string[] \| RegExp      | Array of whitelisted search params, or a regular expression used to whitelist search params of incoming request. If not provided, search params will not be logged. |
| beforeSend              | (event: Event) => Event | This function is applied to all events before sending to Sentry. If provided, all whitelists are ignored.                                                           |

## Sensitive data

Toucan does not send [PII (Personally Identifiable Information)](https://docs.sentry.io/data-management/sensitive-data/) by default.

This includes:

- All request Headers
- All request Cookies
- All request search params
- Request body

You will need to whitelist potentially sensitive data using:

- whitelistedHeaders option (array of headers or Regex)
- whitelistedCookies option (array of cookies or Regex)
- whitelistedSearchParams option (array of search params or Regex)
- toucan.setRequestBody function (stringified JSON)
- beforeSend option (if you need more flexibility than whitelistedX functions)
