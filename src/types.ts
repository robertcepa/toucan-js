import {
  Options as SentryOptions,
  Event as SentryEvent,
  Breadcrumb as SentryBreadcrumb,
  StackFrame,
  SamplingContext as SentrySamplingContext,
} from '@sentry/types';

export type RewriteFrames = {
  root?: string;
  iteratee?: (frame: StackFrame) => StackFrame;
};

export type Context = {
  waitUntil: (promise: Promise<any>) => void;
  request?: Request;
};

type WithEvent = {
  event: FetchEvent | ScheduledEvent;
};

type WithContext = {
  context: Context;
  request?: Request;
};

// for Durable Objects
type WithRequest = {
  request: Request;
};

// Other options from original SamplingContext are noop in CF Workers
// This is basically what NodeJS SDK allows (https://github.com/getsentry/sentry-javascript/blob/334b09750a4bc7b697c259b08c55e05f5fcbb0d1/packages/node/src/handlers.ts#L76)
type SamplingContext = {
  request?: SentrySamplingContext['request'];
};

export type OtherOptions = {
  dsn?: SentryOptions['dsn'];
  allowedCookies?: string[] | RegExp;
  allowedHeaders?: string[] | RegExp;
  allowedSearchParams?: string[] | RegExp;
  attachStacktrace?: SentryOptions['attachStacktrace'];
  beforeSend?: (event: Event) => Event;
  debug?: SentryOptions['debug'];
  environment?: SentryOptions['environment'];
  maxBreadcrumbs?: SentryOptions['maxBreadcrumbs'];
  pkg?: Record<string, any>;
  release?: SentryOptions['release'];
  rewriteFrames?: RewriteFrames;
  /**
   * @deprecated Use tracesSampleRate.
   */
  sampleRate?: SentryOptions['sampleRate'];
  tracesSampleRate?: SentryOptions['tracesSampleRate'];
  tracesSampler?: (samplingContext: SamplingContext) => number | boolean;
  transportOptions?: Compute<
    Pick<NonNullable<SentryOptions['transportOptions']>, 'headers'>
  >;
};

export type Options =
  | (WithEvent & OtherOptions)
  | (WithContext & OtherOptions)
  | (WithRequest & OtherOptions);

export type Level =
  | 'critical'
  | 'fatal'
  | 'error'
  | 'warning'
  | 'info'
  | 'log'
  | 'debug';

// Overwrite default level type of enum to type of union of string literals
export type Breadcrumb = Compute<
  Omit<SentryBreadcrumb, 'level'> & { level?: Level }
>;

export type Event = Compute<
  Omit<SentryEvent, 'level' | 'breadcrumbs'> & {
    level?: Level;
    breadcrumbs?: Breadcrumb[];
  }
>;

/**
 * Force TS to load a type that has not been computed
 * (to resolve composed types that TS hasn't resolved).
 * https://pirix-gh.github.io/ts-toolbelt/modules/_any_compute_.html
 *
 * @example
 * // becomes {foo: string, baz: boolean}
 * type Foo = Compute<{bar: string} & {baz: boolean}>
 */
type Compute<A extends any> = A extends Function
  ? A
  : {
      [K in keyof A]: A[K];
    } & {};
