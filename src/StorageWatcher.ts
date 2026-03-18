/**
 * StorageWatcher — reactive watcher for localStorage & sessionStorage.
 *
 * Monitors storage mutations within the same tab by monkey-patching
 * Storage.prototype methods. Supports watching specific keys (including
 * keys that don't exist yet), all key changes, and new key creation.
 */

import { DEFAULTS } from './constants';
import { AlreadyDestroyedError, StorageUnavailableError } from './errors';
import { installPatch, uninstallPatch } from './patch';
import type {
  StorageMutationEvent,
  StorageWatcherOptions,
  StorageType,
  Unsubscribe,
  WatchAnyCallback,
  WatchCallback,
  WatchNewCallback,
} from './types';

/** Test key used to verify storage availability. */
const STORAGE_TEST_KEY = '__storage_watcher_test__';

/**
 * Resolve a StorageType string to the actual Storage instance.
 */
function resolveStorage(storageType: StorageType): Storage {
  return storageType === 'sessionStorage' ? sessionStorage : localStorage;
}

/**
 * Verify that a storage backend is available and functional.
 */
function validateStorage(storage: Storage, storageType: StorageType): void {
  try {
    storage.setItem(STORAGE_TEST_KEY, 'test');
    storage.removeItem(STORAGE_TEST_KEY);
  } catch (error) {
    throw new StorageUnavailableError(storageType, { cause: error });
  }
}

export class StorageWatcher {
  /** The storage backend being watched. */
  private readonly storage: Storage;

  /** The storage type name (for error messages). */
  private readonly storageType: StorageType;

  /** Per-key listeners: Map<key, Set<callback>>. */
  private readonly keyListeners = new Map<string, Set<WatchCallback>>();

  /** Listeners for all key changes. */
  private readonly anyListeners = new Set<WatchAnyCallback>();

  /** Listeners for new key creation. */
  private readonly newListeners = new Set<WatchNewCallback>();

  /** Whether this instance has been destroyed. */
  private destroyed = false;

  /** Bound mutation handler registered with the patch layer. */
  private readonly handleMutation: (event: StorageMutationEvent) => void;

  /**
   * Create a new StorageWatcher.
   *
   * @param options - Configuration options.
   * @param options.storageType - Which storage to watch: 'localStorage' (default) or 'sessionStorage'.
   * @throws {StorageUnavailableError} If the storage backend is not available.
   */
  constructor(options?: StorageWatcherOptions) {
    this.storageType = options?.storageType ?? DEFAULTS.STORAGE_TYPE;
    this.storage = resolveStorage(this.storageType);
    validateStorage(this.storage, this.storageType);

    // Create bound handler that filters to this instance's storage
    this.handleMutation = (event: StorageMutationEvent) => {
      if (event.storage !== this.storage) return;

      const { key, newValue, oldValue, type } = event;

      // Fire per-key listeners
      const keyCallbacks = this.keyListeners.get(key);
      if (keyCallbacks) {
        for (const cb of keyCallbacks) {
          try {
            cb(newValue, oldValue);
          } catch {
            // Swallow to protect other listeners
          }
        }
      }

      // Fire onAny listeners
      for (const cb of this.anyListeners) {
        try {
          cb(key, newValue, oldValue);
        } catch {
          // Swallow to protect other listeners
        }
      }

      // Fire onNew listeners when a brand-new key is created
      if (type === 'setItem' && oldValue === null && newValue !== null) {
        for (const cb of this.newListeners) {
          try {
            cb(key, newValue);
          } catch {
            // Swallow to protect other listeners
          }
        }
      }
    };

    // Register with the patch layer
    installPatch(this.handleMutation);
  }

  /**
   * Watch a specific key for value changes.
   *
   * Works even if the key doesn't exist yet — the callback will fire
   * when the key is eventually created via setItem().
   *
   * @param key - The storage key to watch.
   * @param callback - Called with (newValue, oldValue) on each change.
   * @returns An unsubscribe function to stop watching.
   * @throws {AlreadyDestroyedError} If the instance has been destroyed.
   */
  on(key: string, callback: WatchCallback): Unsubscribe {
    if (this.destroyed) {
      throw new AlreadyDestroyedError('on');
    }

    let callbacks = this.keyListeners.get(key);
    if (!callbacks) {
      callbacks = new Set();
      this.keyListeners.set(key, callbacks);
    }
    callbacks.add(callback);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      callbacks!.delete(callback);
      if (callbacks!.size === 0) {
        this.keyListeners.delete(key);
      }
    };
  }

  /**
   * Watch all key changes across the storage.
   *
   * @param callback - Called with (key, newValue, oldValue) on each change.
   * @returns An unsubscribe function to stop watching.
   * @throws {AlreadyDestroyedError} If the instance has been destroyed.
   */
  onAny(callback: WatchAnyCallback): Unsubscribe {
    if (this.destroyed) {
      throw new AlreadyDestroyedError('onAny');
    }

    this.anyListeners.add(callback);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.anyListeners.delete(callback);
    };
  }

  /**
   * Watch for brand-new keys being created in storage.
   *
   * Fires only on setItem() when the key didn't previously exist
   * (i.e., oldValue was null). Does NOT fire on removeItem or clear.
   *
   * @param callback - Called with (key, value) when a new key is created.
   * @returns An unsubscribe function to stop watching.
   * @throws {AlreadyDestroyedError} If the instance has been destroyed.
   */
  onNew(callback: WatchNewCallback): Unsubscribe {
    if (this.destroyed) {
      throw new AlreadyDestroyedError('onNew');
    }

    this.newListeners.add(callback);

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      this.newListeners.delete(callback);
    };
  }

  /**
   * Destroy this watcher instance.
   *
   * Removes all listeners and unregisters from the patch layer.
   * After destroy(), calling on(), onAny(), or onNew() will throw.
   * This method is idempotent — calling it multiple times is safe.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.keyListeners.clear();
    this.anyListeners.clear();
    this.newListeners.clear();

    uninstallPatch(this.handleMutation);
  }
}
