import { createTransport } from '@sentry/core';
import type {
  Transport,
  TransportMakeRequestResponse,
  TransportRequest,
} from '@sentry/types';
import { rejectedSyncPromise } from '@sentry/utils';
import type { FetchTransportOptions } from './types';

/**
 * Creates a Transport that uses native fetch. This transport automatically extends the Workers lifetime with 'waitUntil'.
 */
export function makeFetchTransport(options: FetchTransportOptions): Transport {
  function makeRequest({
    body,
  }: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    try {
      const fetchFn = options.fetcher ?? fetch;
      const request = fetchFn(options.url, {
        method: 'POST',
        headers: options.headers,
        body,
      }).then((response) => {
        return {
          statusCode: response.status,
          headers: {
            'retry-after': response.headers.get('Retry-After'),
            'x-sentry-rate-limits': response.headers.get(
              'X-Sentry-Rate-Limits',
            ),
          },
        };
      });

      /**
       * Call waitUntil to extend Workers Event lifetime
       */
      if (options.context) {
        options.context.waitUntil(request);
      }

      return request;
    } catch (e) {
      return rejectedSyncPromise(e);
    }
  }

  return createTransport(options, makeRequest);
}
