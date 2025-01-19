import { Scope, getIntegrationsToSetup } from '@sentry/core';
import { stackParserFromStackParserOptions } from '@sentry/utils';
import { ToucanClient } from './client';
import {
  linkedErrorsIntegration,
  requestDataIntegration,
  zodErrorsIntegration,
} from './integrations';
import { defaultStackParser } from './stacktrace';
import { makeFetchTransport } from './transports';
import type { Options } from './types';
import { getSentryRelease } from './utils';
import type { Breadcrumb, CheckIn, MonitorConfig } from '@sentry/types';

/**
 * The Cloudflare Workers SDK.
 */
export class Toucan extends Scope {
  #options: Options;

  constructor(options: Options) {
    super();

    options.defaultIntegrations =
      options.defaultIntegrations === false
        ? []
        : [
            ...(Array.isArray(options.defaultIntegrations)
              ? options.defaultIntegrations
              : [
                  requestDataIntegration(options.requestDataOptions),
                  linkedErrorsIntegration(),
                  zodErrorsIntegration(),
                ]),
          ];

    if (options.release === undefined) {
      const detectedRelease = getSentryRelease();
      if (detectedRelease !== undefined) {
        options.release = detectedRelease;
      }
    }

    this.#options = options;

    this.attachNewClient();
  }

  /**
   * Creates new ToucanClient and links it to this instance.
   */
  protected attachNewClient() {
    const client = new ToucanClient({
      ...this.#options,
      transport: makeFetchTransport,
      integrations: getIntegrationsToSetup(this.#options),
      stackParser: stackParserFromStackParserOptions(
        this.#options.stackParser || defaultStackParser,
      ),
      transportOptions: {
        ...this.#options.transportOptions,
        context: this.#options.context,
      },
    });

    this.setClient(client);
    client.setSdk(this);
    client.setupIntegrations();
  }

  /**
   * Sets the request body context on all future events.
   *
   * @param body Request body.
   * @example
   * const body = await request.text();
   * toucan.setRequestBody(body);
   */
  setRequestBody(body: unknown) {
    this.getClient<ToucanClient>()?.setRequestBody(body);
  }

  /**
   * Enable/disable the SDK.
   *
   * @param enabled
   */
  setEnabled(enabled: boolean): void {
    this.getClient<ToucanClient>()?.setEnabled(enabled);
  }

  /**
   * Create a cron monitor check in and send it to Sentry.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   */
  captureCheckIn(
    checkIn: CheckIn,
    monitorConfig?: MonitorConfig,
    scope?: Scope,
  ): string {
    if (checkIn.status === 'in_progress') {
      this.setContext('monitor', { slug: checkIn.monitorSlug });
    }

    const client = this.getClient<ToucanClient>() as ToucanClient;
    return client.captureCheckIn(checkIn, monitorConfig, scope);
  }

  /**
   * Add a breadcrumb to the current scope.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs: number = 100): this {
    const client = this.getClient<ToucanClient>() as ToucanClient;
    const max = client.getOptions().maxBreadcrumbs || maxBreadcrumbs;

    return super.addBreadcrumb(breadcrumb, max);
  }

  /**
   * Clone all data from this instance into a new Toucan instance.
   *
   * @override
   * @returns New Toucan instance.
   */
  clone(): Toucan {
    // Create new scope using the same options
    const toucan = new Toucan({ ...this.#options });

    // And copy all the scope data
    toucan._breadcrumbs = [...this._breadcrumbs];
    toucan._tags = { ...this._tags };
    toucan._extra = { ...this._extra };
    toucan._contexts = { ...this._contexts };
    toucan._user = this._user;
    toucan._level = this._level;
    toucan._session = this._session;
    toucan._transactionName = this._transactionName;
    toucan._fingerprint = this._fingerprint;
    toucan._eventProcessors = [...this._eventProcessors];
    toucan._requestSession = this._requestSession;
    toucan._attachments = [...this._attachments];
    toucan._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
    toucan._propagationContext = { ...this._propagationContext };
    toucan._lastEventId = this._lastEventId;

    return toucan;
  }

  /**
   * Creates a new scope with and executes the given operation within.
   * The scope is automatically removed once the operation
   * finishes or throws.
   */
  withScope<T>(callback: (scope: Toucan) => T): T {
    const toucan = this.clone();
    return callback(toucan);
  }
}
