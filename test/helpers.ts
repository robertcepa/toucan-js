import makeServiceWorkerEnv from "service-worker-mock";
import { v4 as uuidv4 } from "uuid";

export const makeEvent = () =>
  new FetchEvent("fetch", {
    request: new Request("https://example.com"),
  });

export type FetchMock = ReturnType<typeof makeFetchMock>;

export const makeFetchMock = () =>
  jest.fn(async (...args: Parameters<typeof fetch>) => {
    return new Response("OK", {
      status: 200,
      statusText: "OK",
    });
  });

export const mockFetch = () => {
  const fetchMock = makeFetchMock();
  Object.assign(global, {
    fetch: fetchMock,
    fetchMock,
  });
};

export const getFetchMockPayload = (fetchMock: FetchMock) => {
  return JSON.parse(global.fetchMock.mock.calls[0][1]?.body as any);
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
