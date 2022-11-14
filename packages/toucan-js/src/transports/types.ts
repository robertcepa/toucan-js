import type { BaseTransportOptions } from '@sentry/types';
import type { Context } from '../types';

export type FetchTransportOptions = BaseTransportOptions & {
  headers?: Record<string, string>;

  context?: Context;
};
