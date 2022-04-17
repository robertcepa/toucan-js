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
- **Familiar API:** Follows [Sentry unified API guidelines](https://docs.sentry.io/development/sdk-dev/unified-api/).

## Usage

```
npm install --save toucan-js
```

### FetchEvent

```ts
import Toucan from 'toucan-js';

addEventListener('fetch', (event) => {
  const sentry = new Toucan({
    dsn: 'dsn...',
    context: event, // Includes 'waitUntil', which is essential for Sentry logs to be delivered. Also includes 'request' -- no need to set it separately.
    allowedHeaders: ['user-agent'],
    allowedSearchParams: /(.*)/,
  });

  sentry.setUser({ id: '1234' });

  event.respondWith(async () => {
    try {
      // Your code

      return new Response('OK', {
        status: 200,
        statusText: 'OK',
      });
    } catch (err) {
      sentry.captureException(err);
      return new Response('Something went wrong', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
  });
});
```

### ScheduledEvent

```ts
import Toucan from 'toucan-js';

addEventListener('scheduled', (event) => {
  const sentry = new Toucan({
    dsn: 'dsn...',
    context: event, // Includes 'waitUntil', which is essential for Sentry logs to be delivered. Note that there's no request in 'scheduled' events context.
  });

  event.waitUntil(async () => {
    try {
      // Your code
    } catch (err) {
      sentry.captureException(err);
    }
  });
});
```

### Equivalent of above as a module (.mjs)

```ts
import Toucan from 'toucan-js';

export default {
  async fetch(request: Request, env: Env, context: Context) {
    const sentry = new Toucan({
      dsn: 'dsn...',
      context, // Includes 'waitUntil', which is essential for Sentry logs to be delivered. Modules workers do not include 'request' in context -- you'll need to set it separately.
      request, // request is not included in 'context', so we set it here.
      allowedHeaders: ['user-agent'],
      allowedSearchParams: /(.*)/,
    });

    try {
      // Your code

      return new Response('OK', {
        status: 200,
        statusText: 'OK',
      });
    } catch (err) {
      sentry.captureException(err);
      return new Response('Something went wrong', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
  },
  async scheduled(controller: Controller, env: Env, context: Context) {
    const sentry = new Toucan({
      dsn: 'dsn...',
      context, // Includes 'waitUntil', which is essential for Sentry logs to be delivered. Note that there's no request in 'scheduled' events context.
    });

    context.waitUntil(async () => {
      try {
        // Your code
      } catch (err) {
        sentry.captureException(err);
      }
    });
  },
};
```

### Durable Objects

```ts
import Toucan from 'toucan-js';

export class DurableObjectExample {
  state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;

    // You're not going to instantiate toucan-js here, because that would lead to race-conditions.
  }

  async fetch(request: Request) {
    // Note that we do not need to set 'context' here -- in Durable Objects it is not necessary to explicitly call 'waitUntil' to extend runtime - Durable Objects make sure that all I/O is finished before deconstructing. 'waitUntil' in Durable Objects only exists for backwards compatibility.
    const sentry = new Toucan({
      dsn: 'dsn...',
      request,
      allowedHeaders: ['user-agent'],
      allowedSearchParams: /(.*)/,
      context: this.state, // OPTIONAL: 'context' really isn't necessary in Durable Objects -- as mentioned above, we don't need 'waitUntil' for 'toucan-js' to successfully deliver logs to Sentry. If you provide 'context', 'toucan-js' will call 'waitUntil' instead of just calling 'fetch'. No difference.
    });

    try {
      // your code

      return new Response('OK', {
        status: 200,
        statusText: 'OK',
      });
    } catch (err) {
      sentry.captureException(err);
      return new Response('Something went wrong', {
        status: 500,
        statusText: 'Internal Server Error',
      });
    }
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
- withScope: Creates a new scope and executes the given operation within. The scope is automatically removed once the operation finishes or throws.

## Minimal options

| Option  | Type                                                                                                                                                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| context | Context                                                                                                                                                                                                 | This can be any object that contains [waitUntil](https://developers.cloudflare.com/workers/about/tips/fetch-event-lifecycle/), and optionally [request](https://developers.cloudflare.com/workers/runtime-apis/request). It can be [FetchEvent](https://developers.cloudflare.com/workers/runtime-apis/fetch-event), [ScheduledEvent](https://developers.cloudflare.com/workers/runtime-apis/scheduled-event), [DurableObjectState](https://developers.cloudflare.com/workers/runtime-apis/durable-objects), or [.mjs context](https://community.cloudflare.com/t/2021-4-15-workers-runtime-release-notes/261917). Note that DurableObjectState and .mjs ctx don't include request, you will need to set it as 'request' option. |
| dsn     | string                                                                                                                                                                                                  | Sentry [Data Source Name](https://docs.sentry.io/error-reporting/quickstart/?platform=javascript#configure-the-sdk). If an empty DSN is passed, we treat it as valid option which signifies disabling the SDK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| event   | DEPRECATED: Use 'context'. [FetchEvent](https://developers.cloudflare.com/workers/runtime-apis/fetch-event) \| [ScheduledEvent](https://developers.cloudflare.com/workers/runtime-apis/scheduled-event) | Workers event. Toucan needs this to be able to call [waitUntil](https://developers.cloudflare.com/workers/about/tips/fetch-event-lifecycle/).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
|         |

## Other options

| Option              | Type                                                                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| allowedCookies      | string[] \| RegExp                                                        | Array of allowed cookies, or a regular expression used to explicitly allow cookies of incoming request. If not provided, cookies will not be logged. No effect without request in context.                                                                                                                                                                                                                                                                                                                                                                                                        |
| allowedHeaders      | string[] \| RegExp                                                        | Array of allowed headers, or a regular expression used to explicitly allow headers of incoming request. If not provided, headers will not be logged. No effect without request in context.                                                                                                                                                                                                                                                                                                                                                                                                        |
| allowedSearchParams | string[] \| RegExp                                                        | Array of allowed search params, or a regular expression used to explicitly allow search params of incoming request. If not provided, search params will not be logged. No effect without request in context.                                                                                                                                                                                                                                                                                                                                                                                      |
| attachStacktrace    | boolean                                                                   | Attaches stacktraces to capture message. Default true.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| beforeSend          | (event: Event) => Event                                                   | This function is applied to all events before sending to Sentry. If provided, all allowlists are ignored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| debug               | boolean                                                                   | Turns debug mode on or off. If debug is enabled, toucan-js will attempt to print out useful debugging information.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| environment         | string                                                                    | Your application's environment (production/staging/...).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| maxBreadcrumbs      | number                                                                    | This variable controls the total amount of breadcrumbs that should be captured. This defaults to 100.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| pkg                 | object                                                                    | Essentially your package.json. Toucan will use it to read project name, version, dependencies, and devDependencies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| release             | string                                                                    | Release tag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| request             | [Request](https://developers.cloudflare.com/workers/runtime-apis/request) | You will want to use this option in Durable Object or .mjs Worker, where `request` isn't included in `context`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| rewriteFrames       | { root?: string, iteratee?: (frame: StackFrame) => StackFrame }           | Allows you to apply a transformation to each frame of the stack trace. `root` path will be appended to the basename of the current frame's url. `iteratee` is a function that takes the frame, applies any transformation on it and returns it back.                                                                                                                                                                                                                                                                                                                                              |
| tracesSampleRate    | number                                                                    | Configures the sample rate as a percentage of events to be sent in the range of 0.0 to 1.0. The default is 1.0 which means that 100% of events are sent. If set to 0.1 only 10% of events will be sent. Events are picked randomly. Invalid sample rate (number between 0 and 1 inclusive) results in skipped event. Replaces deprecated `sampleRate` option.                                                                                                                                                                                                                                     |
| tracesSampler       | (samplingContext: SamplingContext) => number \| boolean                   | Function to compute sample rate dynamically and filter unwanted traces. Should return a number (sample rate between 0 and 1 inclusive), or a boolean (returning true is equivalent to returning 1 and returning false is equivalent to returning 0). `SamplingContext` contains `request` property (if applicable), which includes information about incoming request, but it's safe to read other surrounding state in the closure, such as your worker's environment variables. Invalid return value results in skipped event. `tracesSampler` takes precedence over `tracesSampleRate` option. |

|
| transportOptions | { headers?: Record<string, string> } | Custom headers to be passed to Sentry. |

## Sensitive data

By default, Toucan does not send any Request property that could carry [PII (Personally Identifiable Information)](https://docs.sentry.io/data-management/sensitive-data/) to Sentry.

This includes:

- All request Headers
- All request Cookies
- All request search params
- Request body

You will need to explicitly allow these data using:

- allowedHeaders option (array of headers or Regex)
- allowedCookies option (array of cookies or Regex)
- allowedSearchParams option (array of search params or Regex)
- toucan.setRequestBody function
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
const SentryWebpackPlugin = require('@sentry/webpack-plugin');
const pkg = require('./package.json');

module.exports = {
  entry: './src/index.ts',
  target: 'webworker',
  devtool: 'source-map',
  plugins: [
    new SentryWebpackPlugin({
      release: `${pkg.name}-${pkg.version}`,
      include: './dist',
      urlPrefix: '/',
    }),
  ],
};
```

For more information, [see this issue](https://github.com/robertcepa/toucan-js/issues/26).
