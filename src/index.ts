/**
 * storage-watcher — Reactive watcher for localStorage & sessionStorage.
 *
 * @packageDocumentation
 */

export { StorageWatcher } from './StorageWatcher';

export type {
  StorageWatcherOptions,
  StorageType,
  WatchCallback,
  WatchAnyCallback,
  WatchNewCallback,
  Unsubscribe,
} from './types';

export {
  StorageWatcherError,
  StorageUnavailableError,
  AlreadyDestroyedError,
} from './errors';
