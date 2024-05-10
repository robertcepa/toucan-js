import { IntegrationIndex } from '@sentry/core/types/integration';
import type { EventHint, Event, Integration } from '@sentry/types';
import type { Toucan } from './sdk';

/**
 * Installs integrations on the current scope.
 *
 * @param integrations array of integration instances
 */
export function setupIntegrations(
  integrations: Integration[],
  sdk: Toucan,
): IntegrationIndex {
  const integrationIndex: IntegrationIndex = {};

  integrations.forEach((integration) => {
    integrationIndex[integration.name] = integration;

    // `setupOnce` is only called the first time
    if (typeof integration.setupOnce === 'function') {
      integration.setupOnce();
    }

    const client = sdk.getClient();

    if (!client) {
      return;
    }

    // `setup` is run for each client
    if (typeof integration.setup === 'function') {
      integration.setup(client);
    }

    if (typeof integration.preprocessEvent === 'function') {
      const callback = integration.preprocessEvent.bind(integration);
      client.on('preprocessEvent', (event, hint) =>
        callback(event, hint, client),
      );
    }

    if (typeof integration.processEvent === 'function') {
      const callback = integration.processEvent.bind(integration);

      const processor = Object.assign(
        (event: Event, hint: EventHint) => callback(event, hint, client),
        {
          id: integration.name,
        },
      );

      client.addEventProcessor(processor);
    }
  });

  return integrationIndex;
}
