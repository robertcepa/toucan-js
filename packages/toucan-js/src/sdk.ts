import { getIntegrationsToSetup, Hub } from '@sentry/core';
import { stackParserFromStackParserOptions } from '@sentry/utils';
import { ToucanClient } from './client';
import { LinkedErrors, RequestData } from './integrations';
import { defaultStackParser } from './stacktrace';
import { makeFetchTransport } from './transports';
import type { Options } from './types';
import { getSentryRelease } from './utils';

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
}
