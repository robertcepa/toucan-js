import {
  Event,
  EventHint,
  EventProcessor,
  Exception,
  ExtendedError,
  Integration,
  StackParser,
} from '@sentry/types';
import { isInstanceOf } from '@sentry/utils';

import { ToucanClient } from '../client';
import { exceptionFromError } from '../eventBuilder';
import { Toucan } from '../sdk';

const DEFAULT_LIMIT = 5;

export type LinkedErrorsOptions = {
  limit: number;
};

export class LinkedErrors implements Integration {
  public static id = 'LinkedErrors';

  public readonly name: string = LinkedErrors.id;

  private readonly limit: LinkedErrorsOptions['limit'];

  public constructor(options: Partial<LinkedErrorsOptions> = {}) {
    this.limit = options.limit || DEFAULT_LIMIT;
  }

  public setupOnce(
    addGlobalEventProcessor: (eventProcessor: EventProcessor) => void,
    getCurrentHub: () => Toucan,
  ): void {
    const client = getCurrentHub().getClient<ToucanClient>();

    if (!client) {
      return;
    }

    addGlobalEventProcessor((event: Event, hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(LinkedErrors);

      if (!self) {
        return event;
      }

      return handler(client.getOptions().stackParser, self.limit, event, hint);
    });
  }
}

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
