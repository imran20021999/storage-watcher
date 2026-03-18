import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageWatcher } from '../src/StorageWatcher';
import {
  AlreadyDestroyedError,
  StorageUnavailableError,
  StorageWatcherError,
} from '../src/errors';
import { getPatchState } from '../src/patch';

describe.each(['localStorage', 'sessionStorage'] as const)('StorageWatcher (%s)', (storageType) => {
  let watcher: StorageWatcher;
  let storage: Storage;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    storage = storageType === 'sessionStorage' ? sessionStorage : localStorage;
    watcher = new StorageWatcher({ storageType });
  });

  afterEach(() => {
    watcher.destroy();
  });

  describe('constructor', () => {
    it('should create without error with default options', () => {
      const w = new StorageWatcher();
      expect(w).toBeInstanceOf(StorageWatcher);
      w.destroy();
    });

    it('should create with explicit storageType', () => {
      expect(watcher).toBeInstanceOf(StorageWatcher);
    });
  });

  describe('on() — specific key watching', () => {
    it('should fire callback when watched key is set', () => {
      const cb = vi.fn();
      watcher.on('name', cb);
      storage.setItem('name', 'Alice');

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith('Alice', null);
    });

    it('should provide correct oldValue and newValue', () => {
      storage.setItem('name', 'Alice');
      const cb = vi.fn();
      watcher.on('name', cb);
      storage.setItem('name', 'Bob');

      expect(cb).toHaveBeenCalledWith('Bob', 'Alice');
    });

    it('should NOT fire for different keys', () => {
      const cb = vi.fn();
      watcher.on('name', cb);
      storage.setItem('other', 'value');

      expect(cb).not.toHaveBeenCalled();
    });

    it('should support multiple watchers on the same key', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      watcher.on('key', cb1);
      watcher.on('key', cb2);
      storage.setItem('key', 'value');

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
    });

    it('should fire when watched key is removed', () => {
      storage.setItem('key', 'value');
      const cb = vi.fn();
      watcher.on('key', cb);
      storage.removeItem('key');

      expect(cb).toHaveBeenCalledWith(null, 'value');
    });

    it('should fire when watched key is cleared', () => {
      storage.setItem('key', 'value');
      const cb = vi.fn();
      watcher.on('key', cb);
      storage.clear();

      expect(cb).toHaveBeenCalledWith(null, 'value');
    });

    it('should fire even when value is unchanged', () => {
      storage.setItem('key', 'same');
      const cb = vi.fn();
      watcher.on('key', cb);
      storage.setItem('key', 'same');

      expect(cb).toHaveBeenCalledWith('same', 'same');
    });

    it('should fire for a key that does not exist yet (future key)', () => {
      const cb = vi.fn();
      watcher.on('future-key', cb);

      // Key doesn't exist yet
      expect(storage.getItem('future-key')).toBeNull();

      // Now create it
      storage.setItem('future-key', 'created!');

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith('created!', null);
    });
  });

  describe('on() — unsubscribe', () => {
    it('should stop firing after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = watcher.on('key', cb);
      storage.setItem('key', 'first');
      expect(cb).toHaveBeenCalledOnce();

      unsub();
      storage.setItem('key', 'second');
      expect(cb).toHaveBeenCalledOnce(); // still 1
    });

    it('should be idempotent', () => {
      const cb = vi.fn();
      const unsub = watcher.on('key', cb);
      unsub();
      expect(() => unsub()).not.toThrow();
    });

    it('should be safe to call after destroy', () => {
      const cb = vi.fn();
      const unsub = watcher.on('key', cb);
      watcher.destroy();
      expect(() => unsub()).not.toThrow();
    });
  });

  describe('onAny()', () => {
    it('should fire for any key change', () => {
      const cb = vi.fn();
      watcher.onAny(cb);
      storage.setItem('a', '1');
      storage.setItem('b', '2');

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenNthCalledWith(1, 'a', '1', null);
      expect(cb).toHaveBeenNthCalledWith(2, 'b', '2', null);
    });

    it('should fire alongside key-specific watchers', () => {
      const keyCb = vi.fn();
      const anyCb = vi.fn();
      watcher.on('key', keyCb);
      watcher.onAny(anyCb);
      storage.setItem('key', 'value');

      expect(keyCb).toHaveBeenCalledOnce();
      expect(anyCb).toHaveBeenCalledOnce();
    });

    it('should fire for removeItem', () => {
      storage.setItem('key', 'value');
      const cb = vi.fn();
      watcher.onAny(cb);
      storage.removeItem('key');

      expect(cb).toHaveBeenCalledWith('key', null, 'value');
    });

    it('should fire for clear (per key)', () => {
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      const cb = vi.fn();
      watcher.onAny(cb);
      storage.clear();

      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('should stop firing after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = watcher.onAny(cb);
      storage.setItem('key', 'first');
      expect(cb).toHaveBeenCalledOnce();

      unsub();
      storage.setItem('key', 'second');
      expect(cb).toHaveBeenCalledOnce();
    });
  });

  describe('onNew()', () => {
    it('should fire when a brand-new key is created', () => {
      const cb = vi.fn();
      watcher.onNew(cb);
      storage.setItem('new-key', 'hello');

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith('new-key', 'hello');
    });

    it('should NOT fire when an existing key is updated', () => {
      storage.setItem('existing', 'old');
      const cb = vi.fn();
      watcher.onNew(cb);
      storage.setItem('existing', 'new');

      expect(cb).not.toHaveBeenCalled();
    });

    it('should NOT fire on removeItem', () => {
      storage.setItem('key', 'value');
      const cb = vi.fn();
      watcher.onNew(cb);
      storage.removeItem('key');

      expect(cb).not.toHaveBeenCalled();
    });

    it('should NOT fire on clear', () => {
      storage.setItem('key', 'value');
      const cb = vi.fn();
      watcher.onNew(cb);
      storage.clear();

      expect(cb).not.toHaveBeenCalled();
    });

    it('should fire for multiple new keys', () => {
      const cb = vi.fn();
      watcher.onNew(cb);
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      storage.setItem('a', '3'); // update, should NOT fire again

      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenNthCalledWith(1, 'a', '1');
      expect(cb).toHaveBeenNthCalledWith(2, 'b', '2');
    });

    it('should fire if a key is removed then re-created', () => {
      const cb = vi.fn();
      watcher.onNew(cb);

      storage.setItem('key', 'first');
      expect(cb).toHaveBeenCalledTimes(1);

      storage.removeItem('key');
      storage.setItem('key', 'second');
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenNthCalledWith(2, 'key', 'second');
    });

    it('should stop firing after unsubscribe', () => {
      const cb = vi.fn();
      const unsub = watcher.onNew(cb);
      storage.setItem('a', '1');
      expect(cb).toHaveBeenCalledOnce();

      unsub();
      storage.setItem('b', '2');
      expect(cb).toHaveBeenCalledOnce();
    });
  });

  describe('destroy()', () => {
    it('should throw AlreadyDestroyedError on on() after destroy', () => {
      watcher.destroy();
      expect(() => watcher.on('key', vi.fn())).toThrow(AlreadyDestroyedError);
    });

    it('should throw AlreadyDestroyedError on onAny() after destroy', () => {
      watcher.destroy();
      expect(() => watcher.onAny(vi.fn())).toThrow(AlreadyDestroyedError);
    });

    it('should throw AlreadyDestroyedError on onNew() after destroy', () => {
      watcher.destroy();
      expect(() => watcher.onNew(vi.fn())).toThrow(AlreadyDestroyedError);
    });

    it('should stop all callbacks after destroy', () => {
      const keyCb = vi.fn();
      const anyCb = vi.fn();
      const newCb = vi.fn();
      watcher.on('key', keyCb);
      watcher.onAny(anyCb);
      watcher.onNew(newCb);

      watcher.destroy();

      storage.setItem('key', 'value');
      expect(keyCb).not.toHaveBeenCalled();
      expect(anyCb).not.toHaveBeenCalled();
      expect(newCb).not.toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      watcher.destroy();
      expect(() => watcher.destroy()).not.toThrow();
    });
  });

  describe('multiple instances', () => {
    it('should both receive events independently', () => {
      const watcher2 = new StorageWatcher({ storageType });
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      watcher.on('key', cb1);
      watcher2.on('key', cb2);

      storage.setItem('key', 'value');

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();

      watcher2.destroy();
    });

    it('should not affect the other when one is destroyed', () => {
      const watcher2 = new StorageWatcher({ storageType });
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      watcher.on('key', cb1);
      watcher2.on('key', cb2);

      watcher.destroy();
      storage.setItem('key', 'value');

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledOnce();

      watcher2.destroy();
    });

    it('should restore patches after last instance is destroyed', () => {
      const watcher2 = new StorageWatcher({ storageType });

      expect(getPatchState().isPatched).toBe(true);

      watcher.destroy();
      expect(getPatchState().isPatched).toBe(true); // still patched

      watcher2.destroy();
      expect(getPatchState().isPatched).toBe(false); // now restored
    });
  });

  describe('storage type isolation', () => {
    it('should only fire for its own storage type', () => {
      const otherType = storageType === 'localStorage' ? 'sessionStorage' : 'localStorage';
      const otherStorage = otherType === 'sessionStorage' ? sessionStorage : localStorage;

      const cb = vi.fn();
      watcher.on('key', cb);

      otherStorage.setItem('key', 'value');
      expect(cb).not.toHaveBeenCalled();

      storage.setItem('key', 'value');
      expect(cb).toHaveBeenCalledOnce();
    });
  });
});

describe('error hierarchy', () => {
  it('AlreadyDestroyedError should be instanceof StorageWatcherError', () => {
    const error = new AlreadyDestroyedError('on');
    expect(error).toBeInstanceOf(StorageWatcherError);
    expect(error).toBeInstanceOf(Error);
  });

  it('StorageUnavailableError should be instanceof StorageWatcherError', () => {
    const error = new StorageUnavailableError('localStorage');
    expect(error).toBeInstanceOf(StorageWatcherError);
    expect(error).toBeInstanceOf(Error);
  });

  it('AlreadyDestroyedError should have correct name and message', () => {
    const error = new AlreadyDestroyedError('on');
    expect(error.name).toBe('AlreadyDestroyedError');
    expect(error.message).toContain('on()');
    expect(error.message).toContain('destroyed');
  });

  it('StorageUnavailableError should have correct name and message', () => {
    const error = new StorageUnavailableError('sessionStorage');
    expect(error.name).toBe('StorageUnavailableError');
    expect(error.message).toContain('sessionStorage');
  });

  it('errors should support cause chaining', () => {
    const cause = new Error('original');
    const error = new StorageUnavailableError('localStorage', { cause });
    expect(error.cause).toBe(cause);
  });
});
