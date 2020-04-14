import Toucan from "../src/index";
import {
  makeEvent,
  getFetchMockPayload,
  mockServiceWorkerEnv,
  mockFetch,
  mockDateNow,
  resetDateNow,
} from "./helpers";

const VALID_DSN = "https://123:456@testorg.ingest.sentry.io/123";

describe("Toucan", () => {
  beforeEach(() => {
    mockServiceWorkerEnv();
    mockFetch();
    mockDateNow();
    jest.resetModules();
  });

  afterEach(() => {
    resetDateNow();
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
    expect(global.fetchMock).toHaveBeenCalledTimes(1);
    expect(getFetchMockPayload(global.fetchMock)).toMatchSnapshot();
  });
});
