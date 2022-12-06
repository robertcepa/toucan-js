import { IntegrationIndex } from '@sentry/core/types/integration';
import type { EventProcessor, Integration } from '@sentry/types';
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

    integration.setupOnce(
      (callback: EventProcessor): void => {
        sdk.getScope()?.addEventProcessor(callback);
      },
      () => sdk,
    );
  });

  return integrationIndex;
}
