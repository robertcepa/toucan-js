import Toucan from "../src/index";
import {
  getFetchMockPayload,
  mockServiceWorkerEnv,
  mockFetch,
  mockDateNow,
  resetDateNow,
  mockUuid,
  mockConsole,
  resetConsole,
  triggerFetchAndWait,
} from "./helpers";
import {} from "@cloudflare/workers-types"; // to get Cloudflare Workers overrides for addEventListener type

const VALID_DSN = "https://123:456@testorg.ingest.sentry.io/123";

jest.mock("uuid");

describe("Toucan", () => {
  beforeEach(() => {
    mockServiceWorkerEnv();
    mockFetch();
    mockDateNow();
    mockUuid();
    mockConsole();
    jest.resetModules();
  });

  afterEach(() => {
    resetDateNow();
    resetConsole();
    jest.clearAllMocks();
  });

  test("disabled mode", async () => {
    const results: ReturnType<Toucan["captureMessage"]>[] = [];
    self.addEventListener("fetch", (event) => {
      // Empty DNS is a Valid option that signifies disabling the SDK, set disabled = true
      const toucan = new Toucan({
        dsn: "",
        event,
      });
      results.push(toucan.captureMessage("test1"));
      results.push(toucan.captureMessage("test2"));
      results.push(toucan.captureMessage("test3"));
      results.push(toucan.captureMessage("test4"));
    });

    // Trigger fetch event defined above
    await self.trigger("fetch", new Request("https://example.com"));

    // No POST requests to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(0);
    // But Toucan should still function, returning 'undefined' (no eventIds generated)
    results.forEach((result) => expect(result).toBeUndefined());
  });

  test("captureMessage", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });
      result = toucan.captureMessage("test");
      event.respondWith(new Response("OK", { status: 200 }));
    });

    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
    // captureMessage should have returned a generated eventId
    expect(result).toMatchSnapshot();
  });

  test("captureException", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      try {
        throw new Error("test");
      } catch (e) {
        result = toucan.captureException(e);
      }

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
    // captureException should have returned a generated eventId
    expect(result).toMatchSnapshot();
  });
});
