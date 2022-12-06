import type { ClientOptions, Options as CoreOptions } from '@sentry/types';
import type { RequestDataOptions } from './integrations';
import type { FetchTransportOptions } from './transports';

export type BaseOptions = {
  context?: Context;
  request?: Request;
  requestDataOptions?: RequestDataOptions;
};

type BaseClientOptions = {
  request?: Request;
  requestData?: unknown;
};

/**
 * Configuration options for Toucan class
 */
export type Options = CoreOptions<FetchTransportOptions> & BaseOptions;

/**
 * Configuration options for the SDK Client class
 */
export type ToucanClientOptions = ClientOptions<FetchTransportOptions> &
  BaseClientOptions;

export type Context = {
  waitUntil: ExecutionContext['waitUntil'];
  request?: Request;
};
