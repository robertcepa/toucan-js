declare module NodeJS {
  interface Global {
    fetch: jest.Mock<
      Promise<Response>,
      [RequestInfo, (RequestInit | undefined)?]
    >;
    console: {
      warn: jest.Mock;
      log: jest.Mock;
      error: jest.Mock;
    };
  }
}
