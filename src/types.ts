import {
  Options as SentryOptions,
  Event as SentryEvent,
  Breadcrumb as SentryBreadcrumb,
  StackFrame,
} from "@sentry/types";

export type RewriteFrames = {
  root?: string;
  iteratee?: (frame: StackFrame) => StackFrame;
};

export type Options = {
  event: FetchEvent | ScheduledEvent;
  dsn?: SentryOptions["dsn"];
  allowedCookies?: string[] | RegExp;
  allowedHeaders?: string[] | RegExp;
  allowedSearchParams?: string[] | RegExp;
  attachStacktrace?: SentryOptions["attachStacktrace"];
  beforeSend?: (event: Event) => Event;
  debug?: SentryOptions["debug"];
  environment?: SentryOptions["environment"];
  maxBreadcrumbs?: SentryOptions["maxBreadcrumbs"];
  pkg?: Record<string, any>;
  release?: SentryOptions["release"];
  rewriteFrames?: RewriteFrames;
  sampleRate?: SentryOptions["sampleRate"];
  transportOptions?: Compute<
    Pick<NonNullable<SentryOptions["transportOptions"]>, "headers">
  >;
};

export type Level =
  | "critical"
  | "fatal"
  | "error"
  | "warning"
  | "info"
  | "log"
  | "debug";
// Overwrite default level type of enum to type of union of string literals
export type Breadcrumb = Compute<
  Omit<SentryBreadcrumb, "level"> & { level?: Level }
>;
export type Event = Compute<
  Omit<SentryEvent, "level" | "breadcrumbs"> & {
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
