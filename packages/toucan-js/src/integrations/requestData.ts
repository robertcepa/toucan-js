import { Event, EventProcessor, Integration, User } from '@sentry/types';

import type { Request as EventRequest } from '@sentry/types';
import { ToucanClient } from '../client';
import { Toucan } from '../sdk';

type Allowlist = string[] | RegExp | boolean;

export type RequestDataOptions = {
  allowedHeaders?: Allowlist;
  allowedCookies?: Allowlist;
  allowedSearchParams?: Allowlist;
  allowedIps?: Allowlist;
};

const defaultRequestDataOptions: RequestDataOptions = {
  allowedHeaders: ['CF-RAY', 'CF-Worker'],
};

export class RequestData implements Integration {
  public static id = 'RequestData';

  public readonly name: string = RequestData.id;

  #options: RequestDataOptions;

  public constructor(options: RequestDataOptions = {}) {
    this.#options = { ...defaultRequestDataOptions, ...options };
  }

  public setupOnce(
    addGlobalEventProcessor: (eventProcessor: EventProcessor) => void,
    getCurrentHub: () => Toucan,
  ): void {
    const client = getCurrentHub().getClient<ToucanClient>();

    if (!client) {
      return;
    }

    addGlobalEventProcessor((event: Event) => {
      const { sdkProcessingMetadata } = event;

      const self = getCurrentHub().getIntegration(RequestData);

      if (!self || !sdkProcessingMetadata) {
        return event;
      }

      if (
        'request' in sdkProcessingMetadata &&
        sdkProcessingMetadata.request instanceof Request
      ) {
        event.request = toEventRequest(
          sdkProcessingMetadata.request,
          this.#options,
        );
        event.user = toEventUser(
          event.user ?? {},
          sdkProcessingMetadata.request,
          this.#options,
        );
      }

      if ('requestData' in sdkProcessingMetadata) {
        if (event.request) {
          event.request.data = sdkProcessingMetadata.requestData as unknown;
        } else {
          event.request = {
            data: sdkProcessingMetadata.requestData as unknown,
          };
        }
      }

      return event;
    });
  }
}

/**
 * Applies allowlists on existing user object.
 *
 * @param user
 * @param request
 * @param options
 * @returns New copy of user
 */
function toEventUser(
  user: User,
  request: Request,
  options: RequestDataOptions,
): User | undefined {
  const ip_address = request.headers.get('CF-Connecting-IP');
  const { allowedIps } = options;

  const newUser: User = { ...user };

  if (
    !('ip_address' in user) && // If ip_address is already set from explicitly called setUser, we don't want to overwrite it
    ip_address &&
    allowedIps !== undefined &&
    testAllowlist(ip_address, allowedIps)
  ) {
    newUser.ip_address = ip_address;
  }

  return Object.keys(newUser).length > 0 ? newUser : undefined;
}

/**
 * Converts data from fetch event's Request to Sentry Request used in Sentry Event
 *
 * @param request Native Request object
 * @param options Integration options
 * @returns Sentry Request object
 */
function toEventRequest(
  request: Request,
  options: RequestDataOptions,
): EventRequest {
  // Build cookies
  const cookieString = request.headers.get('cookie');
  let cookies: Record<string, string> | undefined = undefined;
  if (cookieString) {
    try {
      cookies = parseCookie(cookieString);
    } catch (e) {
      // Cookie string failed to parse, no need to do anything
    }
  }

  const headers: Record<string, string> = {};

  // Build headers (omit cookie header, because we used it in the previous step)
  for (const [k, v] of request.headers.entries()) {
    if (k !== 'cookie') {
      headers[k] = v;
    }
  }

  const eventRequest: EventRequest = {
    method: request.method,
    cookies,
    headers,
  };

  try {
    const url = new URL(request.url);
    eventRequest.url = `${url.protocol}//${url.hostname}${url.pathname}`;
    eventRequest.query_string = url.search;
  } catch (e) {
    // `new URL` failed, let's try to split URL the primitive way
    const qi = request.url.indexOf('?');
    if (qi < 0) {
      // no query string
      eventRequest.url = request.url;
    } else {
      eventRequest.url = request.url.substr(0, qi);
      eventRequest.query_string = request.url.substr(qi + 1);
    }
  }

  // Let's try to remove sensitive data from incoming Request
  const { allowedHeaders, allowedCookies, allowedSearchParams } = options;

  if (allowedHeaders !== undefined && eventRequest.headers) {
    eventRequest.headers = applyAllowlistToObject(
      eventRequest.headers,
      allowedHeaders,
    );
    if (Object.keys(eventRequest.headers).length === 0) {
      delete eventRequest.headers;
    }
  } else {
    delete eventRequest.headers;
  }

  if (allowedCookies !== undefined && eventRequest.cookies) {
    eventRequest.cookies = applyAllowlistToObject(
      eventRequest.cookies,
      allowedCookies,
    );
    if (Object.keys(eventRequest.cookies).length === 0) {
      delete eventRequest.cookies;
    }
  } else {
    delete eventRequest.cookies;
  }

  if (allowedSearchParams !== undefined) {
    const params = Object.fromEntries(
      new URLSearchParams(eventRequest.query_string),
    );
    const allowedParams = new URLSearchParams();

    Object.keys(applyAllowlistToObject(params, allowedSearchParams)).forEach(
      (allowedKey) => {
        allowedParams.set(allowedKey, params[allowedKey]);
      },
    );

    eventRequest.query_string = allowedParams.toString();
  } else {
    delete eventRequest.query_string;
  }

  return eventRequest;
}

type Target = Record<string, string>;

type Predicate = (item: string) => boolean;

/**
 * Helper function that tests 'allowlist' on string.
 *
 * @param target
 * @param allowlist
 * @returns True if target is allowed.
 */
function testAllowlist(target: string, allowlist: Allowlist): boolean {
  if (typeof allowlist === 'boolean') {
    return allowlist;
  } else if (allowlist instanceof RegExp) {
    return allowlist.test(target);
  } else if (Array.isArray(allowlist)) {
    const allowlistLowercased = allowlist.map((item) => item.toLowerCase());

    return allowlistLowercased.includes(target);
  } else {
    return false;
  }
}

/**
 * Helper function that applies 'allowlist' to target's entries.
 *
 * @param target
 * @param allowlist
 * @returns New object with allowed keys.
 */
function applyAllowlistToObject(target: Target, allowlist: Allowlist): Target {
  let predicate: Predicate = () => false;

  if (typeof allowlist === 'boolean') {
    return allowlist ? target : {};
  } else if (allowlist instanceof RegExp) {
    predicate = (item: string) => allowlist.test(item);
  } else if (Array.isArray(allowlist)) {
    const allowlistLowercased = allowlist.map((item) => item.toLowerCase());

    predicate = (item: string) => allowlistLowercased.includes(item);
  } else {
    return {};
  }

  return Object.keys(target)
    .map((key) => key.toLowerCase())
    .filter((key) => predicate(key))
    .reduce<Target>((allowed, key) => {
      allowed[key] = target[key];
      return allowed;
    }, {});
}

type ParsedCookie = Record<string, string>;

/**
 * Converts cookie string to an object.
 *
 * @param cookieString
 * @returns Object of cookie entries, or empty object if something went wrong during the conversion.
 */
function parseCookie(cookieString: string): ParsedCookie {
  if (typeof cookieString !== 'string') {
    return {};
  }

  try {
    return cookieString
      .split(';')
      .map((part) => part.split('='))
      .reduce<ParsedCookie>((acc, [cookieKey, cookieValue]) => {
        acc[decodeURIComponent(cookieKey.trim())] = decodeURIComponent(
          cookieValue.trim(),
        );
        return acc;
      }, {});
  } catch {
    return {};
  }
}
