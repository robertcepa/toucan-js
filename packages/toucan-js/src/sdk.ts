import { getIntegrationsToSetup, Hub, Scope } from '@sentry/core';
import { stackParserFromStackParserOptions } from '@sentry/utils';
import { ToucanClient } from './client';
import { LinkedErrors, RequestData } from './integrations';
import { defaultStackParser } from './stacktrace';
import { makeFetchTransport } from './transports';
import type { Options } from './types';
import { getSentryRelease } from './utils';
import { CheckIn, MonitorConfig } from '@sentry/types';

/**
 * The Cloudflare Workers SDK.
 */
export class Toucan extends Hub {
  constructor(options: Options) {
    options.defaultIntegrations =
      options.defaultIntegrations === false
        ? []
        : [
            ...(Array.isArray(options.defaultIntegrations)
              ? options.defaultIntegrations
              : [
                  new RequestData(options.requestDataOptions),
                  new LinkedErrors(),
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

    super(client);

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
}
