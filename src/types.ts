/**
 * Type definitions for storage-watcher.
 */

/** Storage backend type. */
export type StorageType = 'localStorage' | 'sessionStorage';

/** Callback for watching a specific key's value changes. */
export type WatchCallback = (newValue: string | null, oldValue: string | null) => void;

/** Callback for watching all key changes. */
export type WatchAnyCallback = (key: string, newValue: string | null, oldValue: string | null) => void;

/** Callback for watching new key creation. */
export type WatchNewCallback = (key: string, value: string) => void;

/** Unsubscribe function returned by on(), onAny(), and onNew(). */
export type Unsubscribe = () => void;

/** Configuration options for StorageWatcher. */
export interface StorageWatcherOptions {
  /** Which storage backend to watch. Defaults to 'localStorage'. */
  storageType?: StorageType;
}

/**
 * Represents a storage mutation event dispatched from the patch layer.
 * Emitted whenever setItem, removeItem, or clear is called on a Storage instance.
 */
export interface StorageMutationEvent {
  /** The storage instance that was mutated (localStorage or sessionStorage). */
  storage: Storage;
  /** The type of mutation that occurred. */
  type: 'setItem' | 'removeItem' | 'clear';
  /** The key affected. Non-null for setItem/removeItem; also non-null for clear (one event per key). */
  key: string;
  /** The value before the mutation. Null if the key didn't exist. */
  oldValue: string | null;
  /** The new value after the mutation. Null for removeItem and clear. */
  newValue: string | null;
}
