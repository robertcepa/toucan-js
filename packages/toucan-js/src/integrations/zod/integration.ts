import type { Integration, IntegrationFn } from '@sentry/types';

/**
 * Define an integration function that can be used to create an integration instance.
 * Note that this by design hides the implementation details of the integration, as they are considered internal.
 *
 * Inlined from https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/integration.ts#L165
 */
export function defineIntegration<Fn extends IntegrationFn>(
  fn: Fn,
): (...args: Parameters<Fn>) => Integration {
  return fn;
}
