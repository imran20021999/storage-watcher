/**
 * Storage.prototype monkey-patching layer with reference counting.
 *
 * Intercepts setItem, removeItem, and clear on Storage.prototype
 * to dispatch StorageMutationEvent to registered listeners.
 *
 * Reference counting ensures:
 * - Patches are installed when the first StorageWatcher instance is created
 * - Patches are removed when the last StorageWatcher instance is destroyed
 * - Multiple instances coexist safely
 */

import type { StorageMutationEvent } from './types';

/** Set of active mutation listeners (one per StorageWatcher instance). */
const listeners = new Set<(event: StorageMutationEvent) => void>();

/** Saved original Storage.prototype methods. */
let originalSetItem: ((key: string, value: string) => void) | null = null;
let originalRemoveItem: ((key: string) => void) | null = null;
let originalClear: (() => void) | null = null;

/**
 * Dispatch a mutation event to all registered listeners.
 */
function dispatch(event: StorageMutationEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Swallow callback errors to prevent one bad listener
      // from breaking storage operations or other listeners.
    }
  }
}

/**
 * Install the Storage.prototype patches if not already installed,
 * and register a mutation listener.
 */
export function installPatch(listener: (event: StorageMutationEvent) => void): void {
  listeners.add(listener);

  // Only patch on the first listener
  if (listeners.size === 1) {
    originalSetItem = Storage.prototype.setItem;
    originalRemoveItem = Storage.prototype.removeItem;
    originalClear = Storage.prototype.clear;

    Storage.prototype.setItem = function patchedSetItem(key: string, value: string): void {
      const oldValue = this.getItem(key);
      originalSetItem!.call(this, key, value);
      dispatch({
        storage: this,
        type: 'setItem',
        key,
        oldValue,
        newValue: value,
      });
    };

    Storage.prototype.removeItem = function patchedRemoveItem(key: string): void {
      const oldValue = this.getItem(key);
      originalRemoveItem!.call(this, key);
      dispatch({
        storage: this,
        type: 'removeItem',
        key,
        oldValue,
        newValue: null,
      });
    };

    Storage.prototype.clear = function patchedClear(): void {
      // Snapshot all existing keys and values before clearing
      const entries: Array<[string, string]> = [];
      for (let i = 0; i < this.length; i++) {
        const k = this.key(i);
        if (k !== null) {
          entries.push([k, this.getItem(k)!]);
        }
      }

      originalClear!.call(this);

      // Dispatch one event per key so per-key watchers fire correctly
      for (const [k, oldValue] of entries) {
        dispatch({
          storage: this,
          type: 'clear',
          key: k,
          oldValue,
          newValue: null,
        });
      }
    };
  }
}

/**
 * Unregister a mutation listener and restore original Storage.prototype
 * methods if this was the last listener.
 */
export function uninstallPatch(listener: (event: StorageMutationEvent) => void): void {
  listeners.delete(listener);

  // Restore originals when the last listener is removed
  if (listeners.size === 0 && originalSetItem !== null) {
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem!;
    Storage.prototype.clear = originalClear!;
    originalSetItem = null;
    originalRemoveItem = null;
    originalClear = null;
  }
}

/**
 * Get the current patch state. Useful for testing and debugging.
 */
export function getPatchState(): { listenerCount: number; isPatched: boolean } {
  return {
    listenerCount: listeners.size,
    isPatched: originalSetItem !== null,
  };
}
