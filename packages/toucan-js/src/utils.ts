import type { Mechanism } from '@sentry/types';
import { GLOBAL_OBJ } from '@sentry/utils';

export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

export function isMechanism(value: unknown): value is Mechanism {
  return (
    isObject(value) &&
    'handled' in value &&
    typeof value.handled === 'boolean' &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

export function containsMechanism(
  value: unknown,
): value is { mechanism: Mechanism } {
  return (
    isObject(value) && 'mechanism' in value && isMechanism(value['mechanism'])
  );
}

/**
 * Tries to find release in a global
 */
export function getSentryRelease(): string | undefined {
  // Most of the plugins from https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/ inject SENTRY_RELEASE global to the bundle
  if (GLOBAL_OBJ.SENTRY_RELEASE && GLOBAL_OBJ.SENTRY_RELEASE.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }
}

/**
 * Creates an entry on existing object and returns it, or creates a new object with the entry if it doesn't exist.
 *
 * @param target
 * @param entry
 * @returns Object with new entry.
 */
export function setOnOptional<
  Target extends { [key: string | number | symbol]: unknown },
  Key extends keyof Target,
>(target: Target | undefined, entry: [Key, Target[Key]]): Target {
  if (target !== undefined) {
    target[entry[0]] = entry[1];
    return target;
  } else {
    return { [entry[0]]: entry[1] } as Target;
  }
}
