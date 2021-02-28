<p align="center">
  <img src="https://i.imgur.com/zHw4F3x.jpg" alt="Logo" height="300">
</p>

[![npm version](https://img.shields.io/npm/v/toucan-js)](https://www.npmjs.com/package/toucan-js)
[![npm version](https://img.shields.io/npm/dw/toucan-js)](https://www.npmjs.com/package/toucan-js)
[![npm version](https://img.shields.io/npm/types/toucan-js)](https://www.npmjs.com/package/toucan-js)

# toucan-js

Toucan is a reliable [Sentry](https://docs.sentry.io/) client for [Cloudflare Workers](https://developers.cloudflare.com/workers/). Follows [Sentry unified API guidelines](https://docs.sentry.io/development/sdk-dev/unified-api/).

## Motivation

In Cloudflare Workers isolate model, it is inadvisable to [set or mutate global state within the event handler](https://developers.cloudflare.com/workers/about/how-it-works). The most of JavaScript SDKs use static methods that mutate global state with request metadata, breadcrumbs, tags, and other extra properties. This is reasonable, because they were implemented for environments where concurrency does not inherently exist. However, using these SDKs in Workers leads to race conditions, such as logging breadrumbs, request data, and other metadata of interleaved events.

Toucan was created with Workers concurrent model in mind. It is a class that is instantiated per-event rather than globally, meaning this kind of race-conditions do not exist, because all request metadata are scoped to a particular fetch event.

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
    allowedHeaders: ["user-agent"],
    allowedSearchParams: /(.*)/,
  });

  sentry.setUser({ id: "1234" });

  event.respondWith(doStuff(event, sentry));
});

async function doStuff(event: FetchEvent, sentry: Toucan) {
  try {
    sentry.addBreadcrumb({
      message: "About to do something",
      category: "log",
    });

    // ...code that may throw

    return new Response("OK", {
      status: 200,
      statusText: "OK",
    });
  } catch (err) {
    sentry.captureException(err);
    return new Response("Something went wrong", {
      status: 500,
      statusText: "Internal Server Error",
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
- setExtra: Set key:value that will be sent as extra data with the event.
- setExtras: Set an object that will be merged sent as extra data with the event.
- setUser: Updates user context information for future events.
- setFingerprint: Overrides the Sentry default grouping.

## Minimal options

| Option | Type                           | Description                                                                                                                                                                                                    |
| ------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| event  | \*FetchEvent \| ScheduledEvent | Workers event. Toucan needs this to be able to call [waitUntil](https://developers.cloudflare.com/workers/about/tips/fetch-event-lifecycle/).                                                                  |
| dsn    | string                         | Sentry [Data Source Name](https://docs.sentry.io/error-reporting/quickstart/?platform=javascript#configure-the-sdk). If an empty DSN is passed, we treat it as valid option which signifies disabling the SDK. |

## Other options

| Option              | Type                                                            | Description                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| allowedCookies      | string[] \| RegExp                                              | Array of allowed cookies, or a regular expression used to explicitly allow cookies of incoming request. If not provided, cookies will not be logged. No effect without request in context.                                                           |
| allowedHeaders      | string[] \| RegExp                                              | Array of allowed headers, or a regular expression used to explicitly allow headers of incoming request. If not provided, headers will not be logged. No effect without request in context.                                                           |
| allowedSearchParams | string[] \| RegExp                                              | Array of allowed search params, or a regular expression used to explicitly allow search params of incoming request. If not provided, search params will not be logged. No effect without request in context.                                         |
| attachStacktrace    | boolean                                                         | Attaches stacktraces to capture message. Default true.                                                                                                                                                                                               |
| beforeSend          | (event: Event) => Event                                         | This function is applied to all events before sending to Sentry. If provided, all allowlists are ignored.                                                                                                                                            |
| debug               | boolean                                                         | Turns debug mode on or off. If debug is enabled, toucan-js will attempt to print out useful debugging information.                                                                                                                                   |
| environment         | string                                                          | Your application's environment (production/staging/...).                                                                                                                                                                                             |
| maxBreadcrumbs      | number                                                          | This variable controls the total amount of breadcrumbs that should be captured. This defaults to 100.                                                                                                                                                |
| pkg                 | object                                                          | Essentially your package.json. Toucan will use it to read project name, version, dependencies, and devDependencies.                                                                                                                                  |
| release             | string                                                          | Release tag.                                                                                                                                                                                                                                         |
| rewriteFrames       | { root?: string, iteratee?: (frame: StackFrame) => StackFrame } | Allows you to apply a transformation to each frame of the stack trace. `root` path will be appended to the basename of the current frame's url. `iteratee` is a function that takes the frame, applies any transformation on it and returns it back. |
| sampleRate          | number                                                          | Configures the sample rate as a percentage of events to be sent in the range of 0.0 to 1.0. The default is 1.0 which means that 100% of events are sent. If set to 0.1 only 10% of events will be sent. Events are picked randomly.                  |
| transportOptions    | { headers?: Record<string, string> }                            | Custom headers to be passed to Sentry.                                                                                                                                                                                                               |

## Sensitive data

Toucan does not send [PII (Personally Identifiable Information)](https://docs.sentry.io/data-management/sensitive-data/) by default.

This includes:

- All request Headers
- All request Cookies
- All request search params
- Request body

You will need to explicitly allow potentially sensitive data using:

- allowedHeaders option (array of headers or Regex)
- allowedCookies option (array of cookies or Regex)
- allowedSearchParams option (array of search params or Regex)
- toucan.setRequestBody function (stringified JSON)
- beforeSend option (if you need more flexibility than allowedX functions)

## Known issues

### Source Maps

Make sure to use the absolute paths on the stack frames and Sentry's artifacts, the default `~/` will not match them properly. Any absolute path will work (i.e., `/`). You will need to use `rewriteFrames` option to add the prefix to the stack frames.

```ts
const toucan = new Toucan({
  dsn: ...
  event,
  rewriteFrames: {
    root: '/'
  }
}
```

Changing the Sentry's artifacts URL depends on plugin you use to upload your source maps.

Example configuration using `@sentry/webpack-plugin`:

```ts
const SentryWebpackPlugin = require("@sentry/webpack-plugin");
const pkg = require("./package.json");

module.exports = {
  entry: "./src/index.ts",
  target: "webworker",
  devtool: "source-map",
  plugins: [
    new SentryWebpackPlugin({
      release: `${pkg.name}-${pkg.version}`,
      include: "./dist",
      urlPrefix: "/",
    }),
  ],
};
```

For more information, [see this issue](https://github.com/robertcepa/toucan-js/issues/26).
