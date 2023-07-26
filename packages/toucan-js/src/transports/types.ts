import type { BaseTransportOptions } from '@sentry/types';
import type { Context } from '../types';

export type FetchTransportOptions = BaseTransportOptions & {
  /**
   * Custom headers passed to fetch.
   */
  headers?: Record<string, string>;

  /**
   * Cloudflare Workers context.
   */
  context?: Context;

  /**
   * Custom fetch function.
   */
  fetcher?: typeof fetch;
};
