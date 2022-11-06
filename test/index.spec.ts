import Toucan, { Options } from '../src/index';
import { jest as jestGlobal } from '@jest/globals';
import {
  mockConsole,
  mockMathRandom,
  resetConsole,
  resetMathRandom,
} from './helpers';

const VALID_DSN = 'https://123:456@testorg.ingest.sentry.io/123';

/**
 * We don't care about exact values of pseudorandomized and time-related properties, as long as they match the type we accept them.
 */
const MESSAGE_REQUEST_BODY_MATCHER = {
  event_id: expect.any(String),
  timestamp: expect.any(Number),
} as const;

/**
 * Additionally for exceptions, we don't care about the actual values in stacktraces because they can change as we update this file.
 * This matcher is created dynamically depending on Error context.
 */
function createExceptionBodyMatcher(
  errors: {
    value: string;
    type: string;
    filenameMatcher?: jest.Expect['any'];
    abs_pathMatcher?: jest.Expect['any'];
  }[]
) {
  return {
    ...MESSAGE_REQUEST_BODY_MATCHER,
    exception: expect.objectContaining({
      values: expect.arrayContaining(
        errors.map(({ value, type, filenameMatcher, abs_pathMatcher }) => {
          return expect.objectContaining({
            stacktrace: expect.objectContaining({
              frames: expect.arrayContaining([
                expect.objectContaining({
                  colno: expect.any(Number),
                  filename: filenameMatcher ?? expect.any(String),
                  function: expect.any(String),
                  lineno: expect.any(Number),
                  ...(abs_pathMatcher ? { abs_path: abs_pathMatcher } : {}),
                }),
              ]),
            }),
            type,
            value,
          });
        })
      ),
    }),
  };
}

type MockRequestInfo = {
  text: () => Promise<string>;
  json: () => Promise<Record<string, any>>;
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
        path: () => true,
      })
      .reply(200, (opts) => {
        // Hack around https://github.com/nodejs/undici/issues/1756
        // Once fixed, we can simply return opts.body and read it from mock Response body

        const text = async () => {
          const buffers = [];
          for await (const data of opts.body) {
            buffers.push(data);
          }
          return Buffer.concat(buffers).toString('utf8');
        };

        requests.push({
          text,
          json: async () => JSON.parse(await text()),
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

  describe('general options', () => {
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

    test('invalid URL does not fail', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request: { url: 'garbage?query%', headers: new Headers() } as Request,
        beforeSend: (event) => event, // don't censor query string
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].json();

      expect(requestBody.request.url).toEqual('garbage');
      expect(requestBody.request.query_string).toEqual('query%');

      expect(requestBody).toMatchSnapshot(MESSAGE_REQUEST_BODY_MATCHER);
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

    test('debug disabled', async () => {
      const spy = jestGlobal.spyOn(Toucan.prototype as any, 'logResponse');

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        debug: false,
      });

      toucan.captureMessage('test');

      await getMiniflareWaitUntil(context);

      expect(console.log).toHaveBeenCalledTimes(0);
      expect(spy).toHaveBeenCalledTimes(0);
    });

    test('debug enabled', async () => {
      const spy = jestGlobal.spyOn(Toucan.prototype as any, 'logResponse');

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        debug: true,
      });

      toucan.captureMessage('test');

      await getMiniflareWaitUntil(context);

      // Expect 1000 POST requests to Sentry
      expect(console.log).toHaveBeenCalledTimes(4);
      expect(spy).toHaveBeenCalledTimes(1);
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
      expect(await requests[0].json()).toMatchSnapshot(
        MESSAGE_REQUEST_BODY_MATCHER
      );
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
      expect(await requests[0].json()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'Unexpected token a in JSON at position 0',
            type: 'SyntaxError',
          },
        ])
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
      expect(await requests[0].json()).toMatchSnapshot(
        createExceptionBodyMatcher([
          { value: 'original error', type: 'Error' },
          { value: 'outer error with cause', type: 'Error' },
        ])
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
      expect(await requests[0].json()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'Non-Error exception captured with keys: bar, foo',
            type: 'Error',
          },
        ])
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
      expect(await requests[0].json()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'test',
            type: 'Error',
          },
        ])
      );
      expect(await requests[1].json()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: 'true',
            type: 'Error',
          },
        ])
      );

      expect(await requests[2].json()).toMatchSnapshot(
        createExceptionBodyMatcher([
          {
            value: '10',
            type: 'Error',
          },
        ])
      );
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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

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

      const requestBody = await requests[0].json();

      expect(requestBody.request).toEqual({
        method: 'POST',
        url: 'https://myworker.workers.dev/',
      });
      expect(requestBody.request.cookies).toBeUndefined();
      expect(requestBody.request.data).toBeUndefined();
      expect(requestBody.request.headers).toBeUndefined();
      expect(requestBody.request.query_string).toBeUndefined();
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

      const requestBody = await requests[0].json();

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
          },
          body: JSON.stringify({ foo: 'bar', bar: 'baz' }),
        }
      );

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request,
        allowedCookies: /^fo/,
        allowedHeaders: ['user-agent', 'X-Foo'],
        allowedSearchParams: ['foo', 'bar'],
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].json();

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
        }
      );

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        allowedCookies: /^fo/,
        allowedHeaders: ['user-agent', 'X-Foo'],
        allowedSearchParams: ['foo', 'bar'],
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

      const requestBody = await requests[0].json();

      expect(requestBody.request).toEqual({
        headers: {
          'X-Foo': 'Bar',
        },
      });
    });
  });

  describe('stack traces', () => {
    test('attachStacktrace = false prevents sending stack traces', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        attachStacktrace: false,
      });

      try {
        throw new Error('test');
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].json();
      expect(requestBody.exception).toEqual({
        values: [
          {
            type: 'Error',
            value: 'test',
          },
        ],
      });
    });

    test('rewriteFrames add root to filenames in stacktrace', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        rewriteFrames: { root: '/my-custom-root' },
      });

      try {
        throw new Error('test');
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].json();

      const matcher = createExceptionBodyMatcher([
        {
          value: 'test',
          type: 'Error',
          filenameMatcher: expect.stringContaining('/my-custom-root'),
        },
      ]);

      expect(requestBody.exception).toEqual(matcher.exception);
    });

    test('rewriteFrames customize frames with iteratee', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        rewriteFrames: {
          iteratee: (frame) => {
            frame.filename = `/dist/${frame.filename}`;
            frame.abs_path = `/usr/bin/${frame.filename}`;

            return frame;
          },
        },
      });

      try {
        throw new Error('test');
      } catch (e) {
        toucan.captureException(e);
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].json();

      const matcher = createExceptionBodyMatcher([
        {
          value: 'test',
          type: 'Error',
          filenameMatcher: expect.stringContaining('/dist'),
          abs_pathMatcher: expect.stringContaining('/usr/bin'),
        },
      ]);

      expect(requestBody.exception).toEqual(matcher.exception);
    });
  });

  describe('fingerprinting', () => {
    test('setFingerprint sets fingerprint on request', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.setFingerprint(['{{ default }}', 'https://example.com']);

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(requests.length).toBe(1);

      const requestBody = await requests[0].json();

      expect(requestBody.fingerprint).toEqual([
        '{{ default }}',
        'https://example.com',
      ]);
    });
  });

  describe('sampling', () => {
    test('tracesSampleRate = 0 should send 0% of events', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        tracesSampleRate: 0,
      });

      for (let i = 0; i < 1000; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(0);
    });

    test('tracesSampleRate = 1 should send 100% of events', async () => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        tracesSampleRate: 1,
      });

      for (let i = 0; i < 1000; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1000);
      expect(requests.length).toBe(1000);
    });

    test('tracesSampleRate = 0.5 should send 50% of events', async () => {
      // Make Math.random always return 0, 0.9, 0, 0.9 ...
      mockMathRandom([0, 0.9]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        tracesSampleRate: 0.5,
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(5);
      expect(requests.length).toBe(5);

      resetMathRandom();
    });

    test('tracesSampleRate set to invalid value results in skipped event', async () => {
      mockMathRandom([0, 0.9]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        // @ts-expect-error Testing invalid runtime value
        tracesSampleRate: 'hello',
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(0);

      resetMathRandom();
    });

    test('tracesSampler evaluates to true, should send all events', async () => {
      // Make Math.random always return 0.999 to increase likelihood of event getting sampled
      mockMathRandom([0.99]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        tracesSampler: () => true,
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(10);
      expect(requests.length).toBe(10);

      resetMathRandom();
    });

    test('tracesSampler evaluates to false, should skip all events', async () => {
      // Make Math.random always return 0 to eliminate likelihood of event getting sampled
      mockMathRandom([0]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        tracesSampler: () => false,
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(0);

      resetMathRandom();
    });

    test('tracesSampler evaluates to 0.5, should send 50% of events', async () => {
      mockMathRandom([0, 0.9]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        tracesSampler: () => 0.5,
      });

      for (let i = 0; i < 1000; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(500);
      expect(requests.length).toBe(500);

      resetMathRandom();
    });

    test('tracesSampler uses properly built samplingContext. Should send 50% of events for requests from https://eyeball.com origin, else skips all events', async () => {
      mockMathRandom([0, 0.9]);

      const options: Options = {
        dsn: VALID_DSN,
        allowedHeaders: ['origin'],
        tracesSampler: (samplingContext) => {
          console.log(samplingContext);
          if (
            samplingContext.request?.headers?.['origin'] ===
            'https://eyeball.com'
          ) {
            return 0.5;
          } else {
            return false;
          }
        },
      };

      const ec1 = new ExecutionContext();
      const toucan1 = new Toucan({
        ...options,
        context: ec1,
        request: new Request('https://worker-route.com/', {
          headers: { origin: 'https://eyeball.com' },
        }),
      });

      for (let i = 0; i < 10; i++) {
        toucan1.captureMessage('test');
      }

      const waitUntilResults1 = await getMiniflareWaitUntil(ec1);

      // Expect 5 POST requests to Sentry, because origin matches (50% sampling)
      expect(waitUntilResults1.length).toBe(5);
      expect(requests.length).toBe(5);

      const ec2 = new ExecutionContext();
      const toucan2 = new Toucan({
        ...options,
        context: ec2,
        request: new Request('https://worker-route.com/', {
          headers: { origin: 'https://eyeball2.com' },
        }),
      });

      for (let i = 0; i < 10; i++) {
        toucan2.captureMessage('test');
      }

      const waitUntilResults2 = await getMiniflareWaitUntil(ec2);

      // Expect no new requests to Sentry, because origin changed (0% sampling)
      expect(waitUntilResults2.length).toBe(0);
      expect(requests.length).toBe(5);

      resetMathRandom();
    });

    test('tracesSampler returning invalid value results in skipped event', async () => {
      mockMathRandom([0, 0.9]);

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        // @ts-expect-error Testing invalid runtime value for JavaScript
        tracesSampler: (samplingContext) => {
          return 'hello';
        },
      });

      for (let i = 0; i < 10; i++) {
        toucan.captureMessage('test');
      }

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
      expect(requests.length).toBe(0);

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

      expect(await requests[0].json()).toMatchObject({
        extra: { foo: 'bar', bar: 'baz' },
      });
      expect(await requests[1].json()).toMatchObject({
        extra: { foo: 'bar', bar: 'baz', baz: 'bam' },
      });
      expect(await requests[2].json()).toMatchObject({
        extra: { foo: 'bar', bar: 'baz' },
      });
      expect(await requests[3].json()).toMatchObject({
        extra: { foo: 'bar' },
      });
    });
  });
});
