/**
 * Sentry client for Cloudflare Workers.
 * Adheres to https://docs.sentry.io/development/sdk-dev/overview/
 */
import { User, Request, Stacktrace, StackFrame } from "@sentry/types";
import { Options, Event, Breadcrumb, Level } from "./types";
import { API } from "@sentry/core";
import {
  isError,
  isPlainObject,
  extractExceptionKeysForMessage,
  normalizeToSize,
} from "@sentry/utils";
import { v4 as uuidv4 } from "uuid";
import { parse } from "cookie";
import { fromError, get } from "stacktrace-js";

export default class Toucan {
  /**
   * If an empty DSN is passed, we should treat it as valid option which signifies disabling the SDK.
   */
  private disabled: boolean;

  /**
   * Options passed to constructor. See Options type.
   */
  private options: Options;

  /**
   * Full store endpoint with auth search params. Parsed from options.dsn.
   */
  private url: string;

  /**
   * Sentry user object.
   */
  private user?: User;

  /**
   * Sentry request object transformed from incoming event.request.
   */
  private request: Request;

  /**
   * Sentry breadcrumbs array.
   */
  private breadcrumbs: Breadcrumb[];

  /**
   * Sentry tags object.
   */
  private tags?: Record<string, string>;

  /**
   * Sentry extra object.
   */
  private extra?: Record<string, string>;

  constructor(options: Options) {
    if (!options.dsn || options.dsn.length === 0) {
      // If an empty DSN is passed, we should treat it as valid option which signifies disabling the SDK.
      this.url = "";
      this.disabled = true;
    } else {
      this.url = new API(options.dsn).getStoreEndpointWithUrlEncodedAuth();
      this.disabled = false;
    }
    this.options = options;
    this.user = undefined;
    this.request = this.toSentryRequest(options.event.request);
    this.breadcrumbs = [];
    this.tags = undefined;
    this.extra = undefined;

    this.beforeSend = this.beforeSend.bind(this);

    /**
     * Wrap all class methods in a proxy that:
     * 1. Wraps all code in try/catch to handle internal erros gracefully.
     * 2. Prevents execution if disabled = true
     */
    return new Proxy(this, {
      get: (target, key: string, receiver) => {
        return (...args: any) => {
          if (this.disabled) return;

          try {
            return Reflect.get(target, key, receiver).apply(target, args);
          } catch (err) {
            console.warn(err);
          }
        };
      },
    });
  }

  /**
   * Set key:value that will be sent as extra data with the event.
   *
   * @param key String key of extra
   * @param value String value of extra
   */
  setExtra(key: string, value: string) {
    if (!this.extra) {
      this.extra = {};
    }

    this.extra[key] = value;
  }

  /**
   * Set an object that will be merged sent as extra data with the event.
   *
   * @param extras Extras context object to merge into current context.
   */
  setExtras(extras: Record<string, string>) {
    this.extra = { ...this.extra, ...extras };
  }

  /**
   * Set key:value that will be sent as tags data with the event.
   *
   * @param key String key of tag
   * @param value String value of tag
   */
  setTag(key: string, value: string) {
    if (!this.tags) {
      this.tags = {};
    }

    this.tags[key] = value;
  }

  /**
   * Set an object that will be merged sent as tags data with the event.
   *
   * @param tags Tags context object to merge into current context.
   */
  setTags(tags: Record<string, string>) {
    this.tags = { ...this.tags, ...tags };
  }

  /**
   * Records a new breadcrumb which will be attached to future events.
   *
   * Breadcrumbs will be added to subsequent events to provide more context on user's actions prior to an error or crash.
   * @param breadcrumb The breadcrum to record.
   */
  addBreadcrumb(breadcrumb: Breadcrumb) {
    if (!breadcrumb.timestamp) {
      breadcrumb.timestamp = this.timestamp();
    }

    this.breadcrumbs.push(breadcrumb);
  }

  /**
   * Captures an exception event and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * @returns The generated eventId.
   */
  captureException(exception: unknown) {
    const event = this.buildEvent({});

    this.options.event.waitUntil(this.reportException(event, exception));

    return event.event_id;
  }

  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @param level Define the level of the message.
   * @returns The generated eventId.
   */
  captureMessage(message: string, level: Level = "info") {
    const event = this.buildEvent({ level, message });

    this.options.event.waitUntil(this.reportMessage(event));

    return event.event_id;
  }

  /**
   * Updates user context information for future events.
   *
   * @param user — User context object to be set in the current context. Pass null to unset the user.
   */
  setUser(user: User | null) {
    this.user = user ? user : undefined;
  }

  /**
   * In Cloudflare Workers it’s not possible to read event.request's body after having generated a response (if you attempt to, it throws an exception).
   * Chances are that if you are interested in reporting request body to Sentry, you have already read the data (via request.json()/request.text()).
   * Use this method to set it in Sentry context.

   * @param body 
   */
  setRequestBody(body: string) {
    this.request.data = body;
  }

  /**
   * Builds a Sentry Event and calls waitUntil on the current worker event.
   *
   * @param data Custom Event data
   */
  private postEvent(data: Event) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "__name__/__version__",
    };

    return fetch(this.url, {
      method: "POST",
      body: JSON.stringify(data),
      headers,
    });
  }

  /**
   * Builds event payload. Applies beforeSend.
   *
   * @param additionalData Additional data added to defaults.
   * @returns Event
   */
  private buildEvent(additionalData: Event): Event {
    const pkg = this.options.pkg;

    // 'release' option takes precedence, if not present - try to derive from package.json
    const release = this.options.release
      ? this.options.release
      : pkg
      ? `${pkg.name}-${pkg.version}`
      : undefined;
    // per https://docs.sentry.io/development/sdk-dev/event-payloads/#required-attributes
    const payload: Event = {
      event_id: uuidv4().replace(/-/g, ""), // dashes are not allowed
      logger: "EdgeWorker",
      platform: "node",
      release,
      environment: this.options.environment,
      user: this.user,
      timestamp: this.timestamp(),
      level: "error",
      modules: pkg
        ? {
            ...pkg.dependencies,
            ...pkg.devDependencies,
          }
        : undefined,
      breadcrumbs: this.getBreadcrumbs(),
      tags: this.tags,
      extra: this.extra,
      ...additionalData,
      request: { ...this.request },
      sdk: {
        name: "__name__",
        version: "__version__",
      },
    };

    const beforeSend = this.options.beforeSend ?? this.beforeSend;
    return beforeSend(payload);
  }

  /**
   * Converts data from fetch event's Request to Sentry Request used in Sentry Event
   *
   * @param request FetchEvent Request
   * @returns Sentry Request
   */
  private toSentryRequest(request: FetchEvent["request"]): Request {
    // Build cookies
    const cookieString = request.headers.get("cookie");
    let cookies: Record<string, string> | undefined = undefined;
    if (cookieString) {
      try {
        cookies = parse(cookieString);
      } catch (e) {}
    }

    const headers: Record<string, string> = {};

    // Build headers (omit cookie header, because we built in in the previous step)
    for (const [k, v] of (request.headers as any).entries()) {
      if (k !== "cookie") {
        headers[k] = v;
      }
    }

    const url = new URL(request.url);

    return {
      method: request.method,
      url: `${url.protocol}//${url.hostname}${url.pathname}`,
      query_string: url.search,
      cookies,
      headers,
    };
  }

  /**
   * This SDK's implementation of beforeSend. If 'beforeSend' is not provided in options, this implementation will be applied.
   * This function is applied to all events before sending to Sentry.
   *
   * By default it:
   * 1. Removes all request headers (unless opts.allowedHeaders is provided - in that case the allowlist is applied)
   * 2. Removes all request cookies (unless opts.allowedCookies is provided- in that case the allowlist is applied)
   * 3. Removes all search params (unless opts.allowedSearchParams is provided- in that case the allowlist is applied)
   *
   * @param event
   * @returns Event
   */
  private beforeSend(event: Event) {
    const request = event.request;

    if (request) {
      // Let's try to remove sensitive data from incoming Request
      const allowedHeaders = this.options.allowedHeaders;
      const allowedCookies = this.options.allowedCookies;
      const allowedSearchParams = this.options.allowedSearchParams;

      if (allowedHeaders) {
        request.headers = this.applyAllowlist(request.headers, allowedHeaders);
      } else {
        delete request.headers;
      }

      if (allowedCookies) {
        request.cookies = this.applyAllowlist(request.cookies, allowedCookies);
      } else {
        delete request.cookies;
      }

      if (allowedSearchParams) {
        const params = Object.fromEntries(
          new URLSearchParams(request.query_string) as any
        );
        const allowedParams = new URLSearchParams();

        Object.keys(this.applyAllowlist(params, allowedSearchParams)).forEach(
          (allowedKey) => {
            allowedParams.set(allowedKey, params[allowedKey]);
          }
        );

        request.query_string = allowedParams.toString();
      } else {
        delete request.query_string;
      }
    }

    event.request = request;
    return event;
  }

  /**
   * Helper function that applies 'allowlist' on 'obj' keys.
   *
   * @param obj
   * @param allowlist
   * @returns New object with allowed keys.
   */
  private applyAllowlist(
    obj: Record<string, any> = {},
    allowlist: string[] | RegExp
  ) {
    let predicate: (item: string) => boolean = (item) => false;

    if (allowlist instanceof RegExp) {
      predicate = (item: string) => allowlist.test(item);
    } else if (Array.isArray(allowlist)) {
      const allowlistLowercased = allowlist.map((item) => item.toLowerCase());

      predicate = (item: string) => allowlistLowercased.includes(item);
    } else {
      console.warn(
        "allowlist must be an array of strings, or a regular expression."
      );
      return {};
    }

    return Object.keys(obj)
      .map((key) => key.toLowerCase())
      .filter((key) => predicate(key))
      .reduce<Record<string, string>>((allowed, key) => {
        allowed[key] = obj[key];
        return allowed;
      }, {});
  }

  /**
   * A number representing the seconds elapsed since the UNIX epoch.
   */
  private timestamp() {
    return Date.now() / 1000;
  }

  /**
   * Builds Message as per https://develop.sentry.dev/sdk/event-payloads/message/, adds it to the event,
   * and sends it to Sentry. Inspired by https://github.com/getsentry/sentry-javascript/blob/master/packages/node/src/backend.ts.
   *
   * @param event
   */
  private async reportMessage(event: Event) {
    const stacktrace = await this.buildStackTrace();

    event.stacktrace = stacktrace;

    return this.postEvent(event);
  }

  /**
   * Builds Exception as per https://docs.sentry.io/development/sdk-dev/event-payloads/exception/, adds it to the event,
   * and sends it to Sentry. Inspired by https://github.com/getsentry/sentry-javascript/blob/master/packages/node/src/backend.ts.
   *
   * @param event
   * @param error
   */
  private async reportException(event: Event, maybeError: unknown) {
    let error: Error;

    if (isError(maybeError)) {
      error = maybeError as Error;
    } else if (isPlainObject(maybeError)) {
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change

      const message = `Non-Error exception captured with keys: ${extractExceptionKeysForMessage(
        maybeError
      )}`;

      this.setExtra("__serialized__", normalizeToSize(maybeError as {}));

      error = new Error(message);
    } else {
      // This handles when someone does: `throw "something awesome";`
      // We use synthesized Error here so we can extract a (rough) stack trace.
      error = new Error(maybeError as string);
    }

    const stacktrace = await this.buildStackTrace(error);
    event.exception = {
      values: [{ type: error.name, value: error.message, stacktrace }],
    };

    return this.postEvent(event);
  }

  /**
   * Builds Stacktrace as per https://docs.sentry.io/development/sdk-dev/event-payloads/stacktrace/
   *
   * @param error Error object. If provided, builds Stacktrace from error, else, gets a backtrace from invocation point.
   * @returns Stacktrace
   */
  private async buildStackTrace(
    error?: Error
  ): Promise<Stacktrace | undefined> {
    if (this.options.attachStacktrace === false) {
      return undefined;
    }

    try {
      const stack = error ? await fromError(error) : await get();

      /**
       * sentry-cli and webpack-sentry-plugin upload the source-maps named by their path with a ~/ prefix.
       * Lets adhere to this behavior.
       */
      const sourceMapUrlPrefix = this.options.sourceMapUrlPrefix ?? "~/";

      return {
        frames: stack
          .map<StackFrame>((frame) => {
            const filename = this.options.stacktraceFileName ?? frame.fileName ?? "";
            return {
              colno: frame.columnNumber,
              lineno: frame.lineNumber,
              filename,
              function: frame.functionName,
              abs_path: `${sourceMapUrlPrefix}${filename}`,
            };
          })
          .reverse(),
      };
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Get the breadcrumbs. If the stack size exceeds MAX_BREADCRUMBS, returns the last MAX_BREADCRUMBS breadcrumbs.
   */
  private getBreadcrumbs() {
    const MAX_BREADCRUMBS = 100;

    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      return this.breadcrumbs.slice(this.breadcrumbs.length - MAX_BREADCRUMBS);
    } else {
      return this.breadcrumbs;
    }
  }
}
