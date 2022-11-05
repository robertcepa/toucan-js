//import { Miniflare } from 'miniflare';
import Toucan from '../src/index';

const VALID_DSN = 'https://123:456@testorg.ingest.sentry.io/123';

describe('Toucan', () => {
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
        console.log(opts);
        // Return information about Request that we can use in tests (https://undici.nodejs.org/#/docs/best-practices/mocking-request?id=reply-with-data-based-on-request)
        return opts;
      })
      .persist();
  });

  // Core functionality is tested on Service Worker's fetch event, and assumed to work in all other formats
  describe('Core functionality', () => {
    test('disabled mode', async () => {
      const context = new ExecutionContext();

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
      const context = new ExecutionContext();

      const toucan = new Toucan({
        context,
      });

      toucan.captureMessage('test1');
      toucan.captureMessage('test2');
      toucan.captureMessage('test3');
      toucan.captureMessage('test4');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(0);
    });

    test('invalid URL does not fail', async () => {
      const context = new ExecutionContext();

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
        request: { url: 'garbage?query%', headers: new Headers() } as Request,
        beforeSend: (event) => event, // don't censor query string
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      console.log(await (waitUntilResults[0] as Response).json());

      /** 
      expect(payload?.request.url).toEqual('garbage');
      expect(payload?.request.query_string).toEqual('query%');

      // Expect POST request to Sentry
      expect(global.fetch).toHaveBeenCalledTimes(1);
      // Match POST request payload snap
      expect(payload).toMatchSnapshot();
      // captureMessage should have returned a generated eventId
      expect(result).toMatchSnapshot();
      */
    });

    test('captureMessage', async () => {
      const context = new ExecutionContext();

      const toucan = new Toucan({
        dsn: VALID_DSN,
        context,
      });

      toucan.captureMessage('test');

      const waitUntilResults = await getMiniflareWaitUntil(context);

      expect(waitUntilResults.length).toBe(1);
      expect(await (waitUntilResults[0] as Response).json()).toMatchSnapshot();
    });
  });

  describe('Service Worker format', () => {
    describe('fetch event', () => {
      test('example', () => {
        expect(true).toBe(true);
      });
    });

    describe('scheduled event', () => {
      test('example', () => {
        expect(true).toBe(true);
      });
    });
  });

  describe('Module Worker format', () => {
    describe('fetch event', () => {
      test('example', () => {
        expect(true).toBe(true);
      });
    });

    describe('scheduled event', () => {
      test('example', () => {
        expect(true).toBe(true);
      });
    });
  });

  describe('Durable Objects', () => {
    test('example', () => {
      expect(true).toBe(true);
    });
  });
});
