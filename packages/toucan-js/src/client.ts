import type { Scope } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core';
import type { Event, EventHint, SeverityLevel } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';
import { eventFromMessage, eventFromUnknownInput } from './eventBuilder';
import { setupIntegrations } from './integration';
import type { Toucan } from './sdk';
import type { ToucanClientOptions } from './types';
import { setOnOptional } from './utils';

/**
 * The Cloudflare Workers SDK Client.
 */
export class ToucanClient extends ServerRuntimeClient<ToucanClientOptions> {
  /**
   * Some functions need to access the scope (Toucan instance) this client is bound to,
   * but calling 'getCurrentHub()' is unsafe because it uses globals.
   * So we store a reference to the Hub after binding to it and provide it to methods that need it.
   */
  #sdk: Toucan | null = null;

  #integrationsInitialized: boolean = false;

  /**
   * Creates a new Toucan SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: ToucanClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: '__name__',
      packages: [
        {
          name: 'npm:' + '__name__',
          version: '__version__',
        },
      ],
      version: '__version__',
    };

    super(options);
  }

  /**
   * By default, integrations are stored in a global. We want to store them in a local instance because they may have contextual data, such as event request.
   */
  public setupIntegrations(): void {
    if (this._isEnabled() && !this.#integrationsInitialized && this.#sdk) {
      this._integrations = setupIntegrations(
        this._options.integrations,
        this.#sdk,
      );
      this.#integrationsInitialized = true;
    }
  }

  public eventFromException(
    exception: unknown,
    hint?: EventHint,
  ): PromiseLike<Event> {
    return resolvedSyncPromise(
      eventFromUnknownInput(
        this.#sdk,
        this._options.stackParser,
        exception,
        hint,
      ),
    );
  }

  public eventFromMessage(
    message: string,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return resolvedSyncPromise(
      eventFromMessage(
        this._options.stackParser,
        message,
        level,
        hint,
        this._options.attachStacktrace,
      ),
    );
  }

  protected _prepareEvent(
    event: Event,
    hint: EventHint,
    scope?: Scope,
  ): PromiseLike<Event | null> {
    event.platform = event.platform || 'javascript';

    if (this.getOptions().request) {
      // Set 'request' on sdkProcessingMetadata to be later processed by RequestData integration
      event.sdkProcessingMetadata = setOnOptional(event.sdkProcessingMetadata, [
        'request',
        this.getOptions().request,
      ]);
    }

    if (this.getOptions().requestData) {
      // Set 'requestData' on sdkProcessingMetadata to be later processed by RequestData integration
      event.sdkProcessingMetadata = setOnOptional(event.sdkProcessingMetadata, [
        'requestData',
        this.getOptions().requestData,
      ]);
    }

    return super._prepareEvent(event, hint, scope);
  }

  public getSdk() {
    return this.#sdk;
  }

  public setSdk(sdk: Toucan) {
    this.#sdk = sdk;
  }

  /**
   * Sets the request body context on all future events.
   *
   * @param body Request body.
   * @example
   * const body = await request.text();
   * toucan.setRequestBody(body);
   */
  public setRequestBody(body: unknown) {
    this.getOptions().requestData = body;
  }

  /**
   * Enable/disable the SDK.
   *
   * @param enabled
   */
  public setEnabled(enabled: boolean): void {
    this.getOptions().enabled = enabled;
  }
}
