/**
 * Sentry client for Cloudflare Workers.
 * Adheres to https://docs.sentry.io/development/sdk-dev/overview/
 */
import { User, Request, Stacktrace } from "@sentry/types";
import { Options, Event, Breadcrumb, Level } from "./types";
import { API } from "@sentry/core";
import { v4 as uuidv4 } from "uuid";
import { parse } from "cookie";
import { fromError } from "stacktrace-js";

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

  constructor(options: Options) {
    if (!options.dsn || options.dsn.length === 0) {
      // If an empty DSN is passed, we should treat it as valid option which signifies disabling the SDK.
      this.url = "";
      this.disabled = true;
    } else {
      try {
        this.url = new API(options.dsn).getStoreEndpointWithUrlEncodedAuth();
        this.disabled = false;
      } catch (dsnError) {
        console.warn(dsnError);
        this.url = "";
        this.disabled = true;
      }
    }
    this.options = options;
    this.user = undefined;
    this.request = this.toSentryRequest(options.event.request);
    this.breadcrumbs = [];
    this.tags = undefined;

    this.beforeSend = this.beforeSend.bind(this);

    /**
     * Wrap all class method in a proxy that:
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
  captureException(exception: Error) {
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

    this.options.event.waitUntil(this.postEvent(event));

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
    for (const [k, v] of request.headers as any) {
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
   * 1. Removes all request headers (unless opts.whitelistedHeaders is provided - in that case the whitelist is applied)
   * 2. Removes all request cookies (unless opts.whitelistedCookies is provided- in that case the whitelist is applied)
   * 3. Removes all search params (unless opts.whitelistedSearchParams is provided- in that case the whitelist is applied)
   *
   * @param event
   * @returns Event
   */
  private beforeSend(event: Event) {
    const request = event.request;

    if (request) {
      // Let's try to remove sensitive data from incoming Request
      const whitelistedHeaders = this.options.whitelistedHeaders;
      const whitelistedCookies = this.options.whitelistedCookies;
      const whitelistedSearchParams = this.options.whitelistedSearchParams;

      if (whitelistedHeaders) {
        request.headers = this.applyWhitelist(
          request.headers,
          whitelistedHeaders
        );
      } else {
        delete request.headers;
      }

      if (whitelistedCookies) {
        request.cookies = this.applyWhitelist(
          request.cookies,
          whitelistedCookies
        );
      } else {
        delete request.cookies;
      }

      if (whitelistedSearchParams) {
        const params = Object.fromEntries(
          new URLSearchParams(request.query_string) as any
        );
        const whitelistedParams = new URLSearchParams();

        Object.keys(
          this.applyWhitelist(params, whitelistedSearchParams)
        ).forEach((whitelistedKey) => {
          whitelistedParams.set(whitelistedKey, params[whitelistedKey]);
        });

        request.query_string = whitelistedParams.toString();
      } else {
        delete request.query_string;
      }
    }

    event.request = request;
    return event;
  }

  /**
   * Helper function that applies 'whitelist' on 'obj' keys.
   *
   * @param obj
   * @param whitelist
   * @returns New object with whitelisted keys.
   */
  private applyWhitelist(
    obj: Record<string, any> = {},
    whitelist: string[] | RegExp
  ) {
    let predicate: (item: string) => boolean = (item) => false;

    if (whitelist instanceof RegExp) {
      predicate = (item: string) => whitelist.test(item);
    } else if (Array.isArray(whitelist)) {
      const whitelistLowercased = whitelist.map((item) => item.toLowerCase());

      predicate = (item: string) => whitelistLowercased.includes(item);
    } else {
      console.warn(
        "Whitelist must be an array of strings, or a regular expression."
      );
      return {};
    }

    return Object.keys(obj)
      .map((key) => key.toLowerCase())
      .filter((key) => predicate(key))
      .reduce<Record<string, string>>((whitelisted, key) => {
        whitelisted[key] = obj[key];
        return whitelisted;
      }, {});
  }

  /**
   * A number representing the seconds elapsed since the UNIX epoch.
   */
  private timestamp() {
    return Date.now() / 1000;
  }

  /**
   * Builds Exception as per https://docs.sentry.io/development/sdk-dev/event-payloads/exception/, adds it to the event,
   * and sends it to Sentry.
   *
   * @param event
   * @param error
   */
  private async reportException(event: Event, error: Error) {
    const stacktrace = await this.buildStackTrace(error);
    event.exception = {
      values: [{ type: error.name, value: error.message, stacktrace }],
    };
    return this.postEvent(event);
  }

  /**
   * Builds Stacktrace as per https://docs.sentry.io/development/sdk-dev/event-payloads/stacktrace/
   *
   * @param error Error object
   * @returns Stacktrace
   */
  private async buildStackTrace(error: Error): Promise<Stacktrace | undefined> {
    try {
      const stack = await fromError(error);

      return {
        frames: stack.map((frame) => {
          return {
            colno: frame.columnNumber,
            lineno: frame.lineNumber,
            filename: frame.fileName,
            function: frame.functionName,
          };
        }),
      };
    } catch (e) {
      return {};
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

  hello() {
    console.log(this.disabled);
    throw new Error("hello");
  }
}
