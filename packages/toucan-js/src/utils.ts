import { Options } from './types';

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 */
export function isValidSampleRate(rate: unknown): rate is number | boolean {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  if (
    !((typeof rate === 'number' && !isNaN(rate)) || typeof rate === 'boolean')
  ) {
    return false;
  }

  // in case sampleRate is a boolean, it will get automatically cast to 1 if it's true and 0 if it's false
  if (rate < 0 || rate > 1) {
    return false;
  }
  return true;
}

/**
 * Determines if tracing is currently enabled.
 *
 * Tracing is enabled when at least one of `tracesSampleRate` and `tracesSampler` is defined in the SDK config.
 */
export function hasTracingEnabled(options: Options): boolean {
  return (
    'sampleRate' in options ||
    'tracesSampleRate' in options ||
    'tracesSampler' in options
  );
}
