import { Scope, getIntegrationsToSetup } from '@sentry/core';
import { stackParserFromStackParserOptions } from '@sentry/utils';
import { ToucanClient } from './client';
import {
  linkedErrorsIntegration,
  requestDataIntegration,
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
  constructor(options: Options | ToucanClient) {
    super();

    if (options instanceof ToucanClient) {
      this.setClient(options);
      options.setSdk(this);
    } else {
      options.defaultIntegrations =
        options.defaultIntegrations === false
          ? []
          : [
              ...(Array.isArray(options.defaultIntegrations)
                ? options.defaultIntegrations
                : [
                    requestDataIntegration(options.requestDataOptions),
                    linkedErrorsIntegration(),
                  ]),
            ];

      if (options.release === undefined) {
        const detectedRelease = getSentryRelease();
        if (detectedRelease !== undefined) {
          options.release = detectedRelease;
        }
      }

      const client = new ToucanClient({
        ...options,
        transport: makeFetchTransport,
        integrations: getIntegrationsToSetup(options),
        stackParser: stackParserFromStackParserOptions(
          options.stackParser || defaultStackParser,
        ),
        transportOptions: {
          ...options.transportOptions,
          context: options.context,
        },
      });

      this.setClient(client);
      client.setSdk(this);
      client.setupIntegrations();
    }
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
   * Creates a new scope with and executes the given operation within.
   * The scope is automatically removed once the operation
   * finishes or throws.
   */
  withScope<T>(callback: (scope: Toucan) => T): T {
    // Clone this scope
    const toucan = new Toucan(this.getClient<ToucanClient>() as ToucanClient);
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
    return callback(toucan);
  }
}
