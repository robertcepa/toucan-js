/**
 * Parts of code taken from: https://github.com/getsentry/sentry-javascript/blob/06d6bd87971b22dcaba99b03e1f885158c7dd66f/packages/hub/src/scope.ts
 */
import { Scope as SentryScope } from "@sentry/hub";
import { Extra, Extras, Primitive, User } from "@sentry/types";
import { Breadcrumb, Event } from "./types";

class SentryScopeAdapter extends SentryScope {
  /**
   * Applies the current context to the event.
   *
   * @param event Event
   */
  applyToEventSync(event: Event): Event {
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

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  static clone(scope?: SentryScopeAdapter): SentryScopeAdapter {
    const newScope = new SentryScopeAdapter();
    if (scope) {
      newScope._breadcrumbs = [...scope._breadcrumbs];
      newScope._tags = { ...scope._tags };
      newScope._extra = { ...scope._extra };
      newScope._contexts = { ...scope._contexts };
      newScope._user = scope._user;
      newScope._level = scope._level;
      newScope._span = scope._span;
      newScope._session = scope._session;
      newScope._transactionName = scope._transactionName;
      newScope._fingerprint = scope._fingerprint;
      newScope._eventProcessors = [...scope._eventProcessors];
    }
    return newScope;
  }
}

export class Scope {
  private adapter: SentryScopeAdapter;

  constructor() {
    this.adapter = new SentryScopeAdapter();
  }
  /**
   * Sets the breadcrumbs in the scope
   *
   * @param breadcrumb
   * @param maxBreadcrumbs
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number | undefined) {
    // Type-casting 'breadcrumb' to any because our level type is a union of literals, as opposed to Level enum.
    return this.adapter.addBreadcrumb(breadcrumb as any, maxBreadcrumbs);
  }

  /**
   * Set key:value that will be sent as tags data with the event.
   *
   * @param key String key of tag
   * @param value Primitive value of tag
   */
  setTag(key: string, value: Primitive) {
    this.adapter.setTag(key, value);
  }

  /**
   * Set an object that will be merged sent as tags data with the event.
   *
   * @param tags Tags context object to merge into current context.
   */
  setTags(tags: { [key: string]: Primitive }) {
    this.adapter.setTags(tags);
  }

  /**
   * Set key:value that will be sent as extra data with the event.
   *
   * @param key String key of extra
   * @param extra Extra value of extra
   */
  setExtra(key: string, extra: Extra) {
    this.adapter.setExtra(key, extra);
  }

  /**
   * Set an object that will be merged sent as extra data with the event.
   *
   * @param extras Extras context object to merge into current context.
   */
  setExtras(extras: Extras) {
    this.adapter.setExtras(extras);
  }

  /**
   * Overrides the Sentry default grouping. See https://docs.sentry.io/data-management/event-grouping/sdk-fingerprinting/
   *
   * @param fingerprint Array of strings used to override the Sentry default grouping.
   */
  setFingerprint(fingerprint: string[]) {
    this.adapter.setFingerprint(fingerprint);
  }

  /**
   * Updates user context information for future events.
   *
   * @param user — User context object to be set in the current context. Pass null to unset the user.
   */
  setUser(user: User | null) {
    this.adapter.setUser(user);
  }

  /**
   * Applies the current context to the event.
   *
   * @param event Event
   */
  applyToEvent(event: Event): Event {
    return this.adapter.applyToEventSync(event);
  }

  /**
   * Inherit values from the parent scope.
   * @param scope to clone.
   */
  static clone(scope?: Scope): Scope {
    const newScope = new Scope();
    if (scope) {
      newScope.adapter = SentryScopeAdapter.clone(scope.adapter);
    }
    return newScope;
  }
}
