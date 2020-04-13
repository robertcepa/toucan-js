import Toucan from "../src/index";
import makeServiceWorkerEnv from "service-worker-mock";

const makeEvent = () =>
  new FetchEvent("fetch", {
    request: new Request("https://example.com"),
  });

const VALID_DSN = "https://123:456@testorg.ingest.sentry.io/123";

describe("Toucan", () => {
  beforeEach(() => {
    Object.assign(
      global,
      makeServiceWorkerEnv(),
      // If you're using sinon ur similar you'd probably use below instead of makeFetchMock
      // fetch: sinon.stub().returns(Promise.resolve())
      {
        fetch: async (...args: Parameters<typeof fetch>) => {
          return new Response("OK", {
            status: 200,
            statusText: "OK",
          });
        },
      }
    );
    jest.resetModules();
  });

  test("disabled mode", async () => {
    const event = makeEvent();

    // Valid option, set disabled = true
    const toucan1 = new Toucan({
      dsn: "",
      event,
    });
    // Valid option, set disabled = true
    const toucan2 = new Toucan({
      event,
    } as any);
    // Invalid option, log 'SentryError: Invalid Dsn', and set disabled = true
    const toucan3 = new Toucan({
      dsn: "hello",
      event,
    });

    expect(toucan1.captureMessage("test")).toBeUndefined();
    expect(toucan2.captureMessage("test")).toBeUndefined();
    expect(toucan3.captureMessage("test")).toBeUndefined();
  });

  test("captureException", async () => {
    const event = makeEvent();
    const toucan = new Toucan({
      dsn: VALID_DSN,
      event,
    });

    expect(toucan.captureMessage("test")).toHaveLength(32);
  });
});
