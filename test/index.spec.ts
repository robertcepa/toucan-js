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
  mockStackTrace,
} from "./helpers";
import {} from "@cloudflare/workers-types"; // to get Cloudflare Workers overrides for addEventListener type

const VALID_DSN = "https://123:456@testorg.ingest.sentry.io/123";

jest.mock("uuid");
jest.mock("stacktrace-js");

describe("Toucan", () => {
  beforeEach(() => {
    mockServiceWorkerEnv();
    mockFetch();
    mockDateNow();
    mockUuid();
    mockConsole();
    mockStackTrace();
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

    await triggerFetchAndWait(self);

    // No POST requests to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(0);
    // But Toucan should still function, returning 'undefined' (no eventIds generated)
    results.forEach((result) => expect(result).toBeUndefined());
  });

  test("disabled mode when no dsn is provided", async () => {
    const results: ReturnType<Toucan["captureMessage"]>[] = [];
    self.addEventListener("fetch", (event) => {
      // Empty DNS is a Valid option that signifies disabling the SDK, set disabled = true
      const toucan = new Toucan({
        event,
      });
      results.push(toucan.captureMessage("test1"));
      results.push(toucan.captureMessage("test2"));
      results.push(toucan.captureMessage("test3"));
      results.push(toucan.captureMessage("test4"));
    });

    await triggerFetchAndWait(self);

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

  test("pass custom headers in transportOptions", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        transportOptions: {
          headers: {
            "X-Custom-Header": "1",
          },
        },
        event,
      });
      toucan.captureMessage("test");
      event.respondWith(new Response("OK", { status: 200 }));
    });

    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Expect fetch to be called with custom headers
    const fetchOptions = global.fetch.mock.calls[0][1];
    const headers = <Record<string, string>>fetchOptions?.headers;
    expect(headers["X-Custom-Header"]).toEqual("1");
  });

  test("captureException: Error", async () => {
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

  test("captureException: Object", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      try {
        throw { foo: "test", bar: "baz" };
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

  test("captureException: primitive", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      try {
        throw "test";
      } catch (e) {
        result = toucan.captureException(e);
      }

      try {
        throw true;
      } catch (e) {
        result = toucan.captureException(e);
      }

      try {
        throw 10;
      } catch (e) {
        result = toucan.captureException(e);
      }

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(3);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch, 0)).toMatchSnapshot();
    expect(getFetchMockPayload(global.fetch, 1)).toMatchSnapshot();
    expect(getFetchMockPayload(global.fetch, 2)).toMatchSnapshot();
    // captureException should have returned a generated eventId
    expect(result).toMatchSnapshot();
  });

  test("addBreadcrumb", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      for (let i = 0; i < 200; i++) {
        toucan.addBreadcrumb({ message: "test", data: { index: i } });
      }
      toucan.captureMessage("test");

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    const payload = getFetchMockPayload(global.fetch);
    // Should have sent only 100 last breadcrums (100 is a limit)
    expect(payload.breadcrumbs.length).toBe(100);
    expect(payload.breadcrumbs[0].data.index).toBe(100);
    expect(payload.breadcrumbs[99].data.index).toBe(199);
  });

  test("setUser", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      toucan.setUser({ id: "testid", email: "test@gmail.com" });
      toucan.captureMessage("test");

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("setTag", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      toucan.setTag("foo", "bar");
      toucan.captureMessage("test");

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("setTags", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      toucan.setTags({ foo: "bar", bar: "baz" });
      toucan.captureMessage("test");

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("setExtra", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      toucan.setExtra("foo", "bar");
      toucan.captureMessage("test");

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("setExtras", async () => {
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      toucan.setExtras({ foo: "bar", bar: "baz" });
      toucan.captureMessage("test");

      event.respondWith(new Response("OK", { status: 200 }));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(self);

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("setRequestBody", async () => {
    const asyncTest = async (event: FetchEvent) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
      });

      toucan.setRequestBody(await event.request.json());
      toucan.captureMessage("test");

      return new Response("OK", { status: 200 });
    };

    self.addEventListener("fetch", (event) => {
      event.respondWith(asyncTest(event));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(
      self,
      new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foo: "bar", bar: "baz" }),
      })
    );

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("allowlists", async () => {
    const asyncTest = async (event: FetchEvent) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
        allowedCookies: /^fo/,
        allowedHeaders: ["user-agent", "X-Foo"],
        allowedSearchParams: ["foo", "bar"],
      });

      toucan.setRequestBody(await event.request.json());
      toucan.captureMessage("test");

      return new Response("OK", { status: 200 });
    };

    self.addEventListener("fetch", (event) => {
      event.respondWith(asyncTest(event));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(
      self,
      new Request("https://example.com?foo=bar&bar=baz&baz=bam", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Foo": "Foo",
          "X-Bar": "Bar",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0",
          cookie: "foo=bar; fo=bar; bar=baz",
        },
        body: JSON.stringify({ foo: "bar", bar: "baz" }),
      })
    );

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("beforeSend", async () => {
    const asyncTest = async (event: FetchEvent) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
        allowedCookies: /^fo/,
        allowedHeaders: ["user-agent", "X-Foo"],
        allowedSearchParams: ["foo", "bar"],
        // beforeSend is provided - allowlists above should be ignored.
        beforeSend: (event) => {
          delete event.request?.cookies;
          delete event.request?.query_string;
          if (event.request) {
            event.request.headers = {
              "X-Foo": "Bar",
            };
            event.request.data = undefined;
          }
          return event;
        },
      });

      toucan.setRequestBody(await event.request.json());
      toucan.captureMessage("test");

      return new Response("OK", { status: 200 });
    };

    self.addEventListener("fetch", (event) => {
      event.respondWith(asyncTest(event));
    });

    // Trigger fetch event defined above
    await triggerFetchAndWait(
      self,
      new Request("https://example.com?foo=bar&bar=baz&baz=bam", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Foo": "Foo",
          "X-Bar": "Bar",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0",
          cookie: "foo=bar; fo=bar; bar=baz",
        },
        body: JSON.stringify({ foo: "bar", bar: "baz" }),
      })
    );

    // Expect POST request to Sentry
    expect(global.fetch).toHaveBeenCalledTimes(1);
    // Match POST request payload snap
    expect(getFetchMockPayload(global.fetch)).toMatchSnapshot();
  });

  test("attachStacktrace false", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
        attachStacktrace: false,
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

  test("rewriteFrames root", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
        rewriteFrames: { root: "/dist/" },
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

  test("rewriteFrames iteratee", async () => {
    let result: string | undefined = undefined;
    self.addEventListener("fetch", (event) => {
      const toucan = new Toucan({
        dsn: VALID_DSN,
        event,
        rewriteFrames: {
          iteratee: (frame) => {
            frame.filename = `/dist/${frame.filename}`;
            frame.abs_path = `/usr/bin/${frame.filename}`;

            return frame;
          },
        },
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
