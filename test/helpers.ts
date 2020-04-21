import makeServiceWorkerEnv from "service-worker-mock";
import { v4 as uuidv4 } from "uuid";
import { fromError } from "stacktrace-js";

export type FetchMock = ReturnType<typeof makeFetchMock>;

export const makeFetchMock = () =>
  jest.fn(async (...args: Parameters<typeof fetch>) => {
    return new Response("OK", {
      status: 200,
      statusText: "OK",
    });
  });

export const mockFetch = () => {
  Object.assign(global, {
    fetch: makeFetchMock(),
  });
};

export const getFetchMockPayload = (fetchMock: FetchMock, callNumber = 0) => {
  return JSON.parse(global.fetch.mock.calls[callNumber][1]?.body as any);
};

export const mockServiceWorkerEnv = () => {
  Object.assign(global, makeServiceWorkerEnv());
};

const realDateNow = Date.now;

export const mockDateNow = () => {
  Date.now = jest.fn(() => 1586752837868);
};

export const resetDateNow = () => {
  Date.now = realDateNow;
};

export const mockUuid = () => {
  (uuidv4 as any).mockImplementation(() => "651b177fe1cb4ac89e15c1ecd2cb1d0a");
};

export const mockStackTrace = () => {
  (fromError as any) = async () => {
    return [
      {
        columnNumber: 0,
        lineNumber: 0,
        fileName: "file",
        functionName: "foo",
      },
      {
        columnNumber: 0,
        lineNumber: 0,
        fileName: "file",
        functionName: "bar",
      },
    ];
  };
};

const realConsole = console;
export const mockConsole = () => {
  console = {
    ...realConsole,
    warn: jest.fn(() => {}),
    error: jest.fn(() => {}),
  };
};

export const resetConsole = () => {
  console = realConsole;
};

/**
 * This does 2 things:
 * 1. Triggers fetch event and waits for response (event.respondWith promise).
 * 2. Waits for all waitUntil work to complete. This is useful for testing Toucan because all POST requests to Sentry server are sent via event.waitUntil.
 *    This means we cannot test fetch mock immediately after getting a response, but we also need to wait for all work in waitUntil promise.
 * @param self
 * @param request
 */
export const triggerFetchAndWait = async (
  self: WorkerGlobalScope & typeof globalThis,
  request = new Request("https://example.com")
) => {
  // Waits for fetch response (event.respondWith)
  await self.trigger("fetch", request);
  // Waits for all waitUntil work to complete (event.waitUntil)
  // missing typings but exists in https://github.com/zackargyle/service-workers/blob/master/packages/service-worker-mock/models/ExtendableEvent.js
  await (self.ExtendableEvent as any).eventsDoneWaiting();
};
