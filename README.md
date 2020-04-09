# toucan-js

Toucan is reliable [Sentry](https://docs.sentry.io/) client for [Cloudflare Workers](https://developers.cloudflare.com/workers/). It adheres to [Sentry unified API guidelines](https://docs.sentry.io/development/sdk-dev/unified-api/) - with minor differences.

Lightweight. Easy to use. In TypeScript.

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
    // do some I/O
    sentry.addBreadcrumb({ message: "Doing some I/O...", category: "log" });
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
-

## Options

| Option                  | Type                    | Description                                                                                                                                                         |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dsn                     | \*string                | Sentry [Data Source Name](https://docs.sentry.io/error-reporting/quickstart/?platform=javascript#configure-the-sdk).                                                |
| event                   | \*FetchEvent            | Workers fetch event. Toucan needs this to be able to call [waitUntil](https://developers.cloudflare.com/workers/about/tips/fetch-event-lifecycle/).                 |
| environment             | string                  | Your application's environment (production/staging/...).                                                                                                            |
| release                 | string                  | Release tag.                                                                                                                                                        |
| pkg                     | string                  | Essentially your package.json. Toucan will use it to read project name, version, dependencies, and devDependencies.                                                 |
| whitelistedHeaders      | string[] \| RegExp      | Array of whitelisted headers, or a regular expression used to whitelist headers of incoming request. If not provided, headers will not be logged.                   |
| whitelistedCookies      | string[] \| RegExp      | Array of whitelisted cookies, or a regular expression used to whitelist cookies of incoming request. If not provided, cookies will not be logged.                   |
| whitelistedSearchParams | string[] \| RegExp      | Array of whitelisted search params, or a regular expression used to whitelist search params of incoming request. If not provided, search params will not be logged. |
| beforeSend              | (event: Event) => Event | This function is applied to all events before sending to Sentry. If provided, all whitelists are ignored.                                                           |
