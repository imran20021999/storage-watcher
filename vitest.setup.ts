/**
 * Vitest setup file for storage-watcher.
 *
 * Creates a class-based MockStorage where methods live on the prototype,
 * which is critical for the monkey-patching mechanism in patch.ts to work.
 * Storage.prototype.setItem/removeItem/clear must be patchable.
 */

class MockStorage implements Storage {
  private _store = new Map<string, string>();

  get length(): number {
    return this._store.size;
  }

  key(index: number): string | null {
    return [...this._store.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this._store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this._store.set(key, String(value));
  }

  removeItem(key: string): void {
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }

  /**
   * Support indexed access for Storage compatibility.
   */
  [name: string]: unknown;
}

// Register the MockStorage class globally so that patch.ts can access Storage.prototype
// @ts-expect-error - Storage doesn't exist in Node environment
globalThis.Storage = MockStorage;

// Create separate instances for localStorage and sessionStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: new MockStorage(),
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: new MockStorage(),
  writable: true,
  configurable: true,
});
