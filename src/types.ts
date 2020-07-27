import {
  Options as SentryOptions,
  Event as SentryEvent,
  Breadcrumb as SentryBreadcrumb,
} from "@sentry/types";

export type Options = {
  dsn: NonNullable<SentryOptions["dsn"]>;
  event: FetchEvent;
  environment?: SentryOptions["environment"];
  release?: SentryOptions["release"];
  beforeSend?: (event: Event) => Event;
  pkg?: Record<string, any>;
  allowedHeaders?: string[] | RegExp;
  allowedCookies?: string[] | RegExp;
  allowedSearchParams?: string[] | RegExp;
  attachStacktrace?: SentryOptions["attachStacktrace"];
  sourceMapUrlPrefix?: string;
  stacktraceFileName?: string;
};

export type Level = "fatal" | "error" | "warning" | "info" | "debug";
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
