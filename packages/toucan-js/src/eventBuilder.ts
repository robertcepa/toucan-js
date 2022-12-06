import type {
  Event,
  EventHint,
  Exception,
  Mechanism,
  SeverityLevel,
  StackFrame,
  StackParser,
} from '@sentry/types';
import {
  addExceptionMechanism,
  addExceptionTypeValue,
  extractExceptionKeysForMessage,
  isError,
  isPlainObject,
  normalizeToSize,
} from '@sentry/utils';
import type { Toucan } from './sdk';
import { containsMechanism } from './utils';

/**
 * Extracts stack frames from the error.stack string
 */
export function parseStackFrames(
  stackParser: StackParser,
  error: Error,
): StackFrame[] {
  return stackParser(error.stack || '', 1);
}

/**
 * There are cases where stacktrace.message is an Event object
 * https://github.com/getsentry/sentry-javascript/issues/1949
 * In this specific case we try to extract stacktrace.message.error.message
 */
function extractMessage(ex: Error & { message: { error?: Error } }): string {
  const message = ex && ex.message;
  if (!message) {
    return 'No error message';
  }
  if (message.error && typeof message.error.message === 'string') {
    return message.error.message;
  }
  return message;
}

/**
 * Extracts stack frames from the error and builds a Sentry Exception
 */
export function exceptionFromError(
  stackParser: StackParser,
  error: Error,
): Exception {
  const exception: Exception = {
    type: error.name || error.constructor.name,
    value: extractMessage(error),
  };

  const frames = parseStackFrames(stackParser, error);

  if (frames.length) {
    exception.stacktrace = { frames };
  }

  if (exception.type === undefined && exception.value === '') {
    exception.value = 'Unrecoverable error caught';
  }

  return exception;
}

/**
 * Builds and Event from a Exception
 */
export function eventFromUnknownInput(
  sdk: Toucan | null,
  stackParser: StackParser,
  exception: unknown,
  hint?: EventHint,
): Event {
  let ex: Error;
  const providedMechanism: Mechanism | undefined =
    hint && hint.data && containsMechanism(hint.data)
      ? hint.data.mechanism
      : undefined;
  const mechanism: Mechanism = providedMechanism ?? {
    handled: true,
    type: 'generic',
  };

  if (!isError(exception)) {
    if (isPlainObject(exception)) {
      // This will allow us to group events based on top-level keys
      // which is much better than creating new group when any key/value change
      const message = `Non-Error exception captured with keys: ${extractExceptionKeysForMessage(
        exception,
      )}`;

      const client = sdk?.getClient();
      const normalizeDepth = client && client.getOptions().normalizeDepth;
      sdk?.configureScope((scope) => {
        scope.setExtra(
          '__serialized__',
          normalizeToSize(exception, normalizeDepth),
        );
      });

      ex = (hint && hint.syntheticException) || new Error(message);
      ex.message = message;
    } else {
      // This handles when someone does: `throw "something awesome";`
      // We use synthesized Error here so we can extract a (rough) stack trace.
      ex = (hint && hint.syntheticException) || new Error(exception as string);
      ex.message = exception as string;
    }
    mechanism.synthetic = true;
  } else {
    ex = exception;
  }

  const event = {
    exception: {
      values: [exceptionFromError(stackParser, ex)],
    },
  };

  addExceptionTypeValue(event, undefined, undefined);
  addExceptionMechanism(event, mechanism);

  return {
    ...event,
    event_id: hint && hint.event_id,
  };
}

/**
 * Builds and Event from a Message
 */
export function eventFromMessage(
  stackParser: StackParser,
  message: string,
  level: SeverityLevel = 'info',
  hint?: EventHint,
  attachStacktrace?: boolean,
): Event {
  const event: Event = {
    event_id: hint && hint.event_id,
    level,
    message,
  };

  if (attachStacktrace && hint && hint.syntheticException) {
    const frames = parseStackFrames(stackParser, hint.syntheticException);
    if (frames.length) {
      event.exception = {
        values: [
          {
            value: message,
            stacktrace: { frames },
          },
        ],
      };
    }
  }

  return event;
}
