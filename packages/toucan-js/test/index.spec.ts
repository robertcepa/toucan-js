import type { Event, EventProcessor, Integration } from '@sentry/types';
import { Toucan } from 'toucan-js';
import {
  mockConsole,
  mockFetch,
  mockMathRandom,
  resetConsole,
  resetMathRandom,
} from './helpers';

const VALID_DSN = 'https://123:456@testorg.ingest.sentry.io/123';

// This is the default buffer size
const DEFAULT_BUFFER_SIZE = 30;

const DEFAULT_INTEGRATIONS = ['RequestData', 'LinkedErrors'];

/**
 * We don't care about exact values of pseudorandomized and time-related properties, as long as they match the type we accept them.
 */
const GENERIC_EVENT_BODY_MATCHER = {
  contexts: expect.objectContaining({
    trace: expect.objectContaining({
      span_id: expect.any(String),
      trace_id: expect.any(String),
    }),
  }),
  event_id: expect.any(String),
  timestamp: expect.any(Number),
  sdk: expect.objectContaining({
    integrations: DEFAULT_INTEGRATIONS,
    name: 'toucan-js',
    version: expect.any(String),
    packages: expect.arrayContaining([
      expect.objectContaining({
        name: 'npm:toucan-js',
        version: expect.any(String),
      }),
    ]),
  }),
} as const;

const PARSED_ENVELOPE_MATCHER = [
  expect.objectContaining({
    event_id: expect.any(String),
    sdk: expect.objectContaining({
      name: 'toucan-js',
      version: expect.any(String),
    }),
    sent_at: expect.any(String),
  }),
  expect.objectContaining({
    type: 'event',
  }),
  expect.objectContaining(GENERIC_EVENT_BODY_MATCHER),
];

/**
 * Additionally for exceptions, we don't care about the actual values in stacktraces because they can change as we update this file.
 * This matcher is created dynamically depending on Error context.
 */
function createExceptionBodyMatcher(
  errors: {
    value: string | number | boolean;
    type?: string;
    filenameMatcher?: jest.Expect['any'];
    abs_pathMatcher?: jest.Expect['any'];
    synthetic?: boolean;
    mechanism?: boolean;
  }[],
) {
  return {
    ...GENERIC_EVENT_BODY_MATCHER,
    exception: expect.objectContaining({
      values: expect.arrayContaining(
        errors.map(
          (
            {
              value,
              type,
              filenameMatcher,
              abs_pathMatcher,
              synthetic,
              mechanism = true,
            },
            index,
          ) => {
            return expect.objectContaining({
              ...(errors.length - 1 === index && mechanism
                ? {
                    mechanism: expect.objectContaining({
                      handled: true,
                      type: 'generic',
                      ...(synthetic ? { synthetic: true } : {}),
                    }),
                  }
                : {}),
              stacktrace: expect.objectContaining({
                frames: expect.arrayContaining([
                  expect.objectContaining({
                    colno: expect.any(Number),
                    filename: filenameMatcher ?? expect.any(String),
                    function: expect.any(String),
                    in_app: expect.any(Boolean),
                    module: expect.any(String),
                    lineno: expect.any(Number),
                    abs_path: abs_pathMatcher ?? expect.any(String),
                  }),
                ]),
              }),
              ...(type !== undefined ? { type } : {}),
              value,
            });
          },
        ),
      ),
    }),
  };
}

type MockRequestInfo = {
  text: () => Promise<string>;
  json: () => Promise<Record<string, any>>;
  parseEnvelope: () => Promise<Record<string, any>[]>; // All items in Envelope (https://develop.sentry.dev/sdk/envelopes/)
  envelopePayload: () => Promise<Record<string, any>>; // Last item in Envelope (https://develop.sentry.dev/sdk/envelopes/)
  headers: Record<string, string>;
  method: string;
  origin: string;
  path: string;
};

describe('Toucan', () => {
  let requests: MockRequestInfo[] = [];
  let context: ExecutionContext;

  beforeAll(() => {
    // Get correctly set up `MockAgent`
    const fetchMock = getMiniflareFetchMock();

    // Throw when no matching mocked request is found
    // (see https://undici.nodejs.org/#/docs/api/MockAgent?id=mockagentdisablenetconnect)
    fetchMock.disableNetConnect();

    const origin = fetchMock.get('https://testorg.ingest.sentry.io');

    // (see https://undici.nodejs.org/#/docs/api/MockPool?id=mockpoolinterceptoptions)
    origin
      .intercept({
        method: () => true,
        path: (path) => path.includes('/envelope/'),
      })
      .reply(200, (opts) => {
        // Hack around https://github.com/nodejs/undici/issues/1756
        // Once fixed, we can simply return opts.body and read it from mock Response body

        let bodyText: string | undefined;

        const text = async () => {
          if (bodyText) return bodyText;

          const buffers = [];
          for await (const data of opts.body) {
            buffers.push(data);
          }
          bodyText = Buffer.concat(buffers).toString('utf8');

          return bodyText;
        };

        const parseEnvelope = async () => {
          return (await text())
            .split('\n')
            .map((jsonLine) => JSON.parse(jsonLine));
        };

        requests.push({
          text,
          json: async () => {
            return JSON.parse(await text());
          },
          parseEnvelope,
          envelopePayload: async () => {
            const envelope = await parseEnvelope();
            return envelope[envelope.length - 1];
          },
          headers: opts.headers as Record<string, string>,
          method: opts.method,
          origin: opts.origin,
          path: opts.path,
        });

        // Return information about Request that we can use in tests (https://undici.nodejs.org/#/docs/best-practices/mocking-request?id=reply-with-data-based-on-request)
        return opts;
      })
      .persist();
  });

  beforeEach(() => {
    context = new ExecutionContext();
    mockConsole();
  });

  afterEach(() => {
    requests = [];
    resetConsole();
  });

  describe('general', () => {
    test('disabled mode', async () => {
      const toucan = new Toucan({
        dsn: '',
        context,
      });

      toucan.captureMessage('test1');
      toucan.captureMessage('test2');
      toucan.captureMessage('test3');
      toucan.captureMessage('test4');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
    });

    test('disabled mode when no dsn is provided', async () => {
      const toucan = new Toucan({
        context,
      });

      toucan.captureMessage('test1');
      toucan.captureMessage('test2');
      toucan.captureMessage('test3');
      toucan.captureMessage('test4');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(0);
    });

    test('disable / enable', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      // Sent
      toucan.captureMessage('test 1');

      toucan.setEnabled(false);

      // Not sent
      toucan.captureMessage('test 2');
      toucan.captureMessage('test 3');
      toucan.captureMessage('test 4');
      toucan.captureException(new Error());
      toucan.captureException(new Error());
      toucan.captureException(new Error());

      toucan.setEnabled(true);

      // Sent
      toucan.captureMessage('test 5');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(2);
      expect(requests.length).toBe(2);
    });

    test('invalid URL does not fail', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request: { url: 'garbage?query%', headers: new Headers() } as Request,
        requestDataOptions: {
          allowedSearchParams: new RegExp('.*'), // don't censor query string
        },
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody).toMatchSnapshot(GENERIC_EVENT_BODY_MATCHER);
    });

    test('pass custom headers in transportOptions', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        transportOptions: {
          headers: {
            'X-Custom-Header': '1',
          },
        },
        context,
      });
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      expect(requests[0].headers['x-custom-header']).toEqual('1');
    });

    test('custom fetcher', async () => {
      const fetcher = mockFetch();
      const toucan = new Toucan({
        dsn: VALID_DSN,
        transportOptions: {
          fetcher,
        },
        context,
      });
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(0);
      expect(fetcher.mock.calls.length).toBe(1);
    });

    test('unhandled exception in SDK options does not explode the worker', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        beforeSend: (event) => {
          // intentionally do something unintentional
          JSON.parse('not json');
          return event;
        },
      });

      expect(() => toucan.captureMessage('test')).not.toThrowError();
    });
  });

  describe('captureMessage', () => {
    // This is testing everything that should use 'waitUntil' to guarantee test completion.
    test(`triggers waitUntil'd fetch`, async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);
    });

    // This is testing Durable Objects where all async tasks complete by default without having to call 'waitUntil'.
    test('triggers naked fetch', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(1);
    });

    // This is testing everything that should use 'waitUntil' to guarantee test completion.
    test(`sends correct body to Sentry`, async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      // Must store in {result: Matcher} because Matchers don't work with arrays
      // https://github.com/facebook/jest/issues/9079
      expect({ result: await requests[0].parseEnvelope() }).toMatchSnapshot({
        result: expect.arrayContaining(PARSED_ENVELOPE_MATCHER),
      });
    });
  });

  describe('captureException', () => {
    // This is testing everything that should use 'waitUntil' to guarantee test completion.
    test(`triggers waitUntil'd fetch`, async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.captureException(new Error());

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);
    });

    // This is testing Durable Objects where all async tasks complete by default without having to call 'waitUntil'.
    test('triggers naked fetch', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(1);
    });

    test('runtime thrown Error', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      try {
        JSON.parse('abc');
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);
      expect(await requests[0].envelopePayload()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'Unexpected token a in JSON at position 0',
            type: 'SyntaxError',
          },
        ]),
      );
    });

    test('Error with cause', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      try {
        try {
          throw new Error('original error');
        } catch (cause) {
          throw new Error('outer error with cause', { cause });
        }
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);
      expect(await requests[0].envelopePayload()).toMatchSnapshot(
        createExceptionBodyMatcher([
          { value: 'original error', type: 'Error' },
          { value: 'outer error with cause', type: 'Error' },
        ]),
      );
    });

    test('object', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      try {
        throw { foo: 'test', bar: 'baz' };
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);
      expect(await requests[0].envelopePayload()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'Non-Error exception captured with keys: bar, foo',
            type: 'Error',
            synthetic: true,
          },
        ]),
      );
    });

    test('captureException: primitive', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      try {
        throw 'test';
      } catch (e) {
        toucan.captureException(e);
      }

      try {
        throw true;
      } catch (e) {
        toucan.captureException(e);
      }

      try {
        throw 10;
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(3);
      expect(requests.length).toBe(3);
      expect(await requests[0].envelopePayload()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'test',
            type: 'Error',
            synthetic: true,
          },
        ]),
      );
      expect(await requests[1].envelopePayload()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: true,
            type: 'Error',
            synthetic: true,
          },
        ]),
      );

      expect(await requests[2].envelopePayload()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 10,
            type: 'Error',
            synthetic: true,
          },
        ]),
      );
    });
  });

  describe('captureCheckIn', () => {
    test(`is sent`, async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      const checkInId = toucan.captureCheckIn({
        monitorSlug: 'my_job',
        status: 'in_progress',
      });

      toucan.captureCheckIn({
        checkInId: checkInId,
        monitorSlug: 'my_job',
        status: 'error',
      });

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(2);
      expect(requests.length).toBe(2);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody).toEqual({
        check_in_id: checkInId,
        monitor_slug: 'my_job',
        status: 'in_progress',
      });

      const requestBody2 = await requests[1].envelopePayload();

      expect(requestBody2).toEqual({
        check_in_id: checkInId,
        monitor_slug: 'my_job',
        status: 'error',
      });

      expect(requestBody.check_in_id).toBe(requestBody2.check_in_id);
    });

    test(`is linked to errors`, async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      const checkInId = toucan.captureCheckIn({
        monitorSlug: 'my_job',
        status: 'in_progress',
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(2);
      expect(requests.length).toBe(2);

      const checkInRequestBody = await requests[0].envelopePayload();

      expect(checkInRequestBody).toEqual({
        check_in_id: checkInId,
        monitor_slug: 'my_job',
        status: 'in_progress',
      });

      const errorRequestBody = await requests[1].envelopePayload();

      expect(errorRequestBody.contexts.monitor).toEqual({ slug: 'my_job' });
    });
  });

  describe('addBreadcrumb', () => {
    test('captures last 100 breadcrumbs by default', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      for (let i = 0; i < 200; i++) {
        toucan.addBreadcrumb({ message: 'test', data: { index: i } });
      }
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      // Should have sent only 100 last breadcrums (100 is default)
      expect(requestBody.breadcrumbs.length).toBe(100);
      expect(requestBody.breadcrumbs[0].data.index).toBe(100);
      expect(requestBody.breadcrumbs[99].data.index).toBe(199);
    });

    test('maxBreadcrumbs option to override max breadcumb count', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        maxBreadcrumbs: 20,
      });

      for (let i = 0; i < 200; i++) {
        toucan.addBreadcrumb({ message: 'test', data: { index: i } });
      }
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      // Should have sent only 20 last breadcrums
      expect(requestBody.breadcrumbs.length).toBe(20);
      expect(requestBody.breadcrumbs[0].data.index).toBe(180);
      expect(requestBody.breadcrumbs[19].data.index).toBe(199);
    });
  });

  describe('setUser', () => {
    test('provides user info', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setUser({ id: 'testid', email: 'test@gmail.com' });
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.user).toEqual({
        id: 'testid',
        email: 'test@gmail.com',
      });
    });
  });

  describe('tags', () => {
    test('setTag adds tag to request', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setTag('foo', 'bar');
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.tags).toEqual({
        foo: 'bar',
      });
    });

    test('setTags adds tags to request', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setTags({ foo: 'bar', bar: 'baz' });
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.tags).toEqual({ foo: 'bar', bar: 'baz' });
    });
  });

  describe('extras', () => {
    test('setExtra adds extra to request', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setExtra('foo', 'bar');
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.extra).toEqual({
        foo: 'bar',
      });
    });

    test('setExtras adds extra to request', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setExtras({ foo: 'bar', bar: 'baz' });
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.extra).toEqual({ foo: 'bar', bar: 'baz' });
    });
  });

  describe('request', () => {
    test('no request PII captured by default', async () => {
      const request = new Request('https://myworker.workers.dev', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      });

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request,
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.request).toEqual({
        method: 'POST',
        url: 'https://myworker.workers.dev/',
      });
      expect(requestBody.request.cookies).toBeUndefined();
      expect(requestBody.request.data).toBeUndefined();
      expect(requestBody.request.headers).toBeUndefined();
      expect(requestBody.request.query_string).toBeUndefined();
      expect(requestBody.user).toBeUndefined();
    });

    test('request body captured after setRequestBody call', async () => {
      const request = new Request('https://myworker.workers.dev', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      });

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request,
      });

      toucan.setRequestBody(await request.json());
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.request).toEqual({
        data: { foo: 'bar' },
        method: 'POST',
        url: 'https://myworker.workers.dev/',
      });
    });

    test('allowlists', async () => {
      const request = new Request(
        'https://example.com?foo=bar&bar=baz&baz=bam',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Foo': 'Foo',
            'X-Bar': 'Bar',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0',
            cookie: 'foo=bar; fo=bar; bar=baz',
            'CF-Connecting-Ip': '255.255.255.255',
          },
          body: JSON.stringify({ foo: 'bar', bar: 'baz' }),
        },
      );

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request,
        requestDataOptions: {
          allowedCookies: /^fo/,
          allowedHeaders: ['user-agent', 'X-Foo'],
          allowedSearchParams: ['foo', 'bar'],
          allowedIps: true,
        },
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.request).toEqual({
        cookies: { fo: 'bar', foo: 'bar' },
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0',
          'x-foo': 'Foo',
        },
        method: 'POST',
        query_string: 'foo=bar&bar=baz',
        url: 'https://example.com/',
      });
      expect(requestBody.user).toEqual({ ip_address: '255.255.255.255' });
    });

    test('beforeSend runs after allowlists and setRequestBody', async () => {
      const request = new Request(
        'https://example.com?foo=bar&bar=baz&baz=bam',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Foo': 'Foo',
            'X-Bar': 'Bar',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0',
            cookie: 'foo=bar; fo=bar; bar=baz',
          },
          body: JSON.stringify({ foo: 'bar', bar: 'baz' }),
        },
      );

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request,
        requestDataOptions: {
          allowedCookies: /^fo/,
          allowedHeaders: ['user-agent', 'X-Foo'],
          allowedSearchParams: ['foo', 'bar'],
        },
        // beforeSend is provided - allowlists above should be ignored.
        beforeSend: (event) => {
          delete event.request?.cookies;
          delete event.request?.query_string;
          if (event.request) {
            event.request.headers = {
              'X-Foo': 'Bar',
            };
            event.request.data = undefined;
          }
          return event;
        },
      });

      toucan.setRequestBody(await request.json());
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.request).toEqual({
        headers: {
          'X-Foo': 'Bar',
        },
        method: 'POST',
        url: 'https://example.com/',
      });
    });
  });

  describe('stacktraces', () => {
    test('attachStacktrace = true sends stacktrace with captureMessage', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        attachStacktrace: true,
      });

      toucan.captureMessage('message with stacktrace');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'message with stacktrace',
            mechanism: false,
          },
        ]),
      );
    });
  });

  describe('fingerprinting', () => {
    test('setFingerprint sets fingerprint on request', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.configureScope((scope) =>
        scope.setFingerprint(['{{ default }}', 'https://example.com']),
      );
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.fingerprint).toEqual([
        '{{ default }}',
        'https://example.com',
      ]);
    });
  });

  describe('sampling', () => {
    test('sampleRate = 0 should send 0% of events', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        sampleRate: 0,
      });

      for (let i = 0; i < 1000; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(0);
    });

    test('sampleRate = 1 should send 100% of events', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        sampleRate: 1,
      });

      for (let i = 0; i < DEFAULT_BUFFER_SIZE; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(DEFAULT_BUFFER_SIZE);
      expect(requests.length).toBe(DEFAULT_BUFFER_SIZE);
    });

    test('sampleRate = 0.5 should send 50% of events', async () => {
      // Make Math.random always return 0, 0.9, 0, 0.9 ...
      mockMathRandom([0, 0.9]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        sampleRate: 0.5,
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(5);
      expect(requests.length).toBe(5);

      resetMathRandom();
    });

    test('sampleRate set to invalid value does not explode the SDK', async () => {
      mockMathRandom([0, 0.9]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        // @ts-expect-error Testing invalid runtime value
        sampleRate: 'hello',
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(10);
      expect(requests.length).toBe(10);

      resetMathRandom();
    });
  });

  describe('scope', () => {
    test('withScope', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setExtra('foo', 'bar');

      // Simple case
      toucan.withScope((scope) => {
        scope.setExtra('bar', 'baz');
        //expected {"foo": "bar", "bar": "baz"}
        toucan.captureMessage('test withScope simple');
      });

      // Nested case
      toucan.withScope((scope) => {
        scope.setExtra('bar', 'baz');
        toucan.withScope((scope) => {
          scope.setExtra('baz', 'bam');
          // expected {"foo": "bar", "bar": "baz", "baz": "bam"}
          toucan.captureMessage('test withScope nested');
        });
        // expected {"foo": "bar", "bar": "baz"}
        toucan.captureMessage('test withScope nested');
      });

      // expected {"foo": "bar"}
      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(4);
      expect(requests.length).toBe(4);

      expect(await requests[0].envelopePayload()).toMatchObject({
        extra: { foo: 'bar', bar: 'baz' },
      });
      expect(await requests[1].envelopePayload()).toMatchObject({
        extra: { foo: 'bar', bar: 'baz', baz: 'bam' },
      });
      expect(await requests[2].envelopePayload()).toMatchObject({
        extra: { foo: 'bar', bar: 'baz' },
      });
      expect(await requests[3].envelopePayload()).toMatchObject({
        extra: { foo: 'bar' },
      });
    });
  });

  describe('integrations', () => {
    class MessageScrubber implements Integration {
      public static id = 'MessageScrubber';

      public readonly name: string = MessageScrubber.id;

      private scrubMessage: string;

      public constructor(scrubMessage: string) {
        this.scrubMessage = scrubMessage;
      }

      public setupOnce(
        addGlobalEventProcessor: (eventProcessor: EventProcessor) => void,
        getCurrentHub: () => Toucan,
      ): void {
        const client = getCurrentHub().getClient();

        if (!client) {
          return;
        }

        addGlobalEventProcessor((event: Event) => {
          const self = getCurrentHub().getIntegration(MessageScrubber);

          if (!self) {
            return event;
          }

          event.message = this.scrubMessage;

          return event;
        });
      }
    }

    test('empty custom integrations do not delete default integrations', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        integrations: [],
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.sdk.integrations).toEqual(DEFAULT_INTEGRATIONS);
    });

    test('custom integrations merge with default integrations', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        integrations: [new MessageScrubber('[redacted]')],
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].envelopePayload();

      expect(requestBody.sdk.integrations).toEqual([
        ...DEFAULT_INTEGRATIONS,
        'MessageScrubber',
      ]);
      expect(requestBody.message).toBe('[redacted]');
    });

    test('integrations do not use globals', async () => {
      const toucan1 = new Toucan({
        dsn: VALID_DSN,
        context,
        integrations: [new MessageScrubber('[redacted-1]')],
      });

      toucan1.captureMessage('test');

      const toucan2 = new Toucan({
        dsn: VALID_DSN,
        context,
        integrations: [new MessageScrubber('[redacted-2]')],
      });

      toucan2.captureMessage('test');

      toucan1.captureMessage('test');
      toucan2.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(4);
      expect(requests.length).toBe(4);

      expect((await requests[0].envelopePayload()).message).toBe(
        '[redacted-1]',
      );
      expect((await requests[1].envelopePayload()).message).toBe(
        '[redacted-2]',
      );
      expect((await requests[2].envelopePayload()).message).toBe(
        '[redacted-1]',
      );
      expect((await requests[3].envelopePayload()).message).toBe(
        '[redacted-2]',
      );
    });
  });
});
