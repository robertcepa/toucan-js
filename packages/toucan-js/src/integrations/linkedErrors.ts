import {
  Event,
  EventHint,
  Exception,
  ExtendedError,
  StackParser,
} from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';
import { defineIntegration } from '@sentry/core';

import { exceptionFromError } from '../eventBuilder';

const DEFAULT_LIMIT = 5;

export type LinkedErrorsOptions = {
  limit: number;
};

export const linkedErrorsIntegration = defineIntegration(
  (options: LinkedErrorsOptions = { limit: DEFAULT_LIMIT }) => {
    return {
      name: 'LinkedErrors',
      processEvent: (event, hint, client) => {
        return handler(
          client.getOptions().stackParser,
          options.limit,
          event,
          hint,
        );
      },
    };
  },
);

function handler(
  parser: StackParser,
  limit: number,
  event: Event,
  hint?: EventHint,
): Event | null {
  if (
    !event.exception ||
    !event.exception.values ||
    !hint ||
    !isInstanceOf(hint.originalException, Error)
  ) {
    return event;
  }
  const linkedErrors = walkErrorTree(
    parser,
    limit,
    hint.originalException as ExtendedError,
  );
  event.exception.values = [...linkedErrors, ...event.exception.values];
  return event;
}

export function walkErrorTree(
  parser: StackParser,
  limit: number,
  error: ExtendedError,
  stack: Exception[] = [],
): Exception[] {
  if (!isInstanceOf(error.cause, Error) || stack.length + 1 >= limit) {
    return stack;
  }

  const exception = exceptionFromError(parser, error.cause as ExtendedError);
  return walkErrorTree(parser, limit, error.cause as ExtendedError, [
    exception,
    ...stack,
  ]);
}
