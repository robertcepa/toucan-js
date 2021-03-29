/**
 * Parts of code taken from: https://github.com/getsentry/sentry-javascript/blob/06d6bd87971b22dcaba99b03e1f885158c7dd66f/packages/hub/src/scope.ts
 */
import { Scope as SentryScope } from "@sentry/hub";
import { Breadcrumb, Event } from "./types";

export class Scope extends SentryScope {
  /**
   * Sets the breadcrumbs in the scope
   *
   * @param breadcrumb
   * @param maxBreadcrumbs
   */
  public addBreadcrumb(
    breadcrumb: Breadcrumb,
    maxBreadcrumbs?: number | undefined
  ) {
    // Type-casting 'breadcrumb' to any because our level type is a union of literals, as opposed to Level enum.
    return super.addBreadcrumb(breadcrumb as any, maxBreadcrumbs);
  }

  /**
   * Applies the current context to the event.
   *
   * @param event Event
   */
  public applyToEventSync(event: Event): Event {
    if (this._extra && Object.keys(this._extra).length) {
      event.extra = { ...this._extra, ...event.extra };
    }
    if (this._tags && Object.keys(this._tags).length) {
      event.tags = { ...this._tags, ...event.tags };
    }
    if (this._user && Object.keys(this._user).length) {
      event.user = { ...this._user, ...event.user };
    }

    event.fingerprint = [
      ...(event.fingerprint ?? []),
      ...(this._fingerprint ?? []),
    ];
    event.fingerprint =
      event.fingerprint.length > 0 ? event.fingerprint : undefined;

    event.breadcrumbs = [
      ...(event.breadcrumbs ?? []),
      ...(this._breadcrumbs ?? []),
    ];
    event.breadcrumbs =
      event.breadcrumbs.length > 0 ? event.breadcrumbs : undefined;

    return event;
  }
}
