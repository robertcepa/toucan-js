declare module NodeJS {
  interface Global {
    fetchMock: jest.Mock<
      Promise<Response>,
      [RequestInfo, (RequestInit | undefined)?]
    >;
    uuidv4Mock: jest.Mock<string>;
  }
}
