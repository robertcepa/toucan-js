/**
 * Taken from https://github.com/cloudflare/miniflare/blob/64e1b263371805d649afb22142e119bfaf473ba3/packages/shared-test-environment/src/globals.ts as a workaround for https://github.com/cloudflare/miniflare/issues/338
 */

import { FetchEvent, ScheduledEvent, kWaitUntil } from '@miniflare/core';
import {
  DurableObjectId,
  DurableObjectState,
  DurableObjectStorage,
} from '@miniflare/durable-objects';
import { Awaitable, Context } from '@miniflare/shared';
import { MockAgent } from 'undici';

declare global {
  class ExecutionContext {
    [kWaitUntil]: Promise<unknown>[];

    passThroughOnException(): void;

    waitUntil(promise: Promise<any>): void;
  }
  function getMiniflareBindings<Bindings = Context>(): Bindings;
  function getMiniflareDurableObjectStorage(
    id: DurableObjectId
  ): Promise<DurableObjectStorage>;
  function getMiniflareDurableObjectState(
    id: DurableObjectId
  ): Promise<DurableObjectState>;
  function runWithMiniflareDurableObjectGates<T>(
    state: DurableObjectState,
    closure: () => Awaitable<T>
  ): Promise<T>;
  function getMiniflareFetchMock(): MockAgent;
  function getMiniflareWaitUntil<WaitUntil extends any[] = unknown[]>(
    event: FetchEvent | ScheduledEvent | ExecutionContext
  ): Promise<WaitUntil>;
  function flushMiniflareDurableObjectAlarms(
    ids: DurableObjectId[]
  ): Promise<void>;
}
