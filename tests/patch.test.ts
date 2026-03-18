import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installPatch, uninstallPatch, getPatchState } from '../src/patch';
import type { StorageMutationEvent } from '../src/types';

describe('patch', () => {
  let listener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    listener = vi.fn();
  });

  afterEach(() => {
    // Ensure patches are cleaned up after each test
    uninstallPatch(listener);
  });

  describe('installPatch / uninstallPatch', () => {
    it('should start unpatched', () => {
      const state = getPatchState();
      expect(state.isPatched).toBe(false);
      expect(state.listenerCount).toBe(0);
    });

    it('should patch on first install', () => {
      installPatch(listener);
      const state = getPatchState();
      expect(state.isPatched).toBe(true);
      expect(state.listenerCount).toBe(1);
    });

    it('should unpatch when last listener is removed', () => {
      installPatch(listener);
      uninstallPatch(listener);
      const state = getPatchState();
      expect(state.isPatched).toBe(false);
      expect(state.listenerCount).toBe(0);
    });

    it('should keep patches with multiple listeners', () => {
      const listener2 = vi.fn();
      installPatch(listener);
      installPatch(listener2);

      expect(getPatchState().listenerCount).toBe(2);
      expect(getPatchState().isPatched).toBe(true);

      uninstallPatch(listener);
      expect(getPatchState().listenerCount).toBe(1);
      expect(getPatchState().isPatched).toBe(true);

      uninstallPatch(listener2);
      expect(getPatchState().listenerCount).toBe(0);
      expect(getPatchState().isPatched).toBe(false);
    });

    it('should be safe to uninstall a listener that was never installed', () => {
      const unknownListener = vi.fn();
      expect(() => uninstallPatch(unknownListener)).not.toThrow();
    });
  });

  describe('setItem interception', () => {
    it('should dispatch event on setItem with correct values', () => {
      installPatch(listener);
      localStorage.setItem('name', 'Alice');

      expect(listener).toHaveBeenCalledOnce();
      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.storage).toBe(localStorage);
      expect(event.type).toBe('setItem');
      expect(event.key).toBe('name');
      expect(event.oldValue).toBeNull();
      expect(event.newValue).toBe('Alice');
    });

    it('should capture old value correctly', () => {
      localStorage.setItem('name', 'Alice');
      installPatch(listener);
      localStorage.setItem('name', 'Bob');

      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.oldValue).toBe('Alice');
      expect(event.newValue).toBe('Bob');
    });

    it('should actually store the value', () => {
      installPatch(listener);
      localStorage.setItem('key', 'value');
      expect(localStorage.getItem('key')).toBe('value');
    });

    it('should fire even when setting the same value', () => {
      localStorage.setItem('key', 'same');
      installPatch(listener);
      localStorage.setItem('key', 'same');

      expect(listener).toHaveBeenCalledOnce();
      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.oldValue).toBe('same');
      expect(event.newValue).toBe('same');
    });
  });

  describe('removeItem interception', () => {
    it('should dispatch event on removeItem', () => {
      localStorage.setItem('token', 'abc123');
      installPatch(listener);
      localStorage.removeItem('token');

      expect(listener).toHaveBeenCalledOnce();
      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.storage).toBe(localStorage);
      expect(event.type).toBe('removeItem');
      expect(event.key).toBe('token');
      expect(event.oldValue).toBe('abc123');
      expect(event.newValue).toBeNull();
    });

    it('should dispatch event when removing a non-existent key', () => {
      installPatch(listener);
      localStorage.removeItem('nonexistent');

      expect(listener).toHaveBeenCalledOnce();
      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.oldValue).toBeNull();
      expect(event.newValue).toBeNull();
    });

    it('should actually remove the value', () => {
      localStorage.setItem('key', 'value');
      installPatch(listener);
      localStorage.removeItem('key');
      expect(localStorage.getItem('key')).toBeNull();
    });
  });

  describe('clear interception', () => {
    it('should dispatch one event per existing key', () => {
      localStorage.setItem('a', '1');
      localStorage.setItem('b', '2');
      localStorage.setItem('c', '3');
      installPatch(listener);
      localStorage.clear();

      expect(listener).toHaveBeenCalledTimes(3);

      const events: StorageMutationEvent[] = listener.mock.calls.map(
        (call: [StorageMutationEvent]) => call[0],
      );
      const keys = events.map((e) => e.key).sort();
      expect(keys).toEqual(['a', 'b', 'c']);

      for (const event of events) {
        expect(event.type).toBe('clear');
        expect(event.newValue).toBeNull();
        expect(event.storage).toBe(localStorage);
      }

      // Verify old values
      const eventMap = new Map(events.map((e) => [e.key, e.oldValue]));
      expect(eventMap.get('a')).toBe('1');
      expect(eventMap.get('b')).toBe('2');
      expect(eventMap.get('c')).toBe('3');
    });

    it('should dispatch no events when clearing empty storage', () => {
      installPatch(listener);
      localStorage.clear();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should actually clear the storage', () => {
      localStorage.setItem('key', 'value');
      installPatch(listener);
      localStorage.clear();
      expect(localStorage.length).toBe(0);
    });
  });

  describe('multiple listeners', () => {
    it('should notify all listeners', () => {
      const listener2 = vi.fn();
      installPatch(listener);
      installPatch(listener2);

      localStorage.setItem('key', 'value');

      expect(listener).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();

      // Clean up
      uninstallPatch(listener2);
    });

    it('should continue dispatching after one listener throws', () => {
      const badListener = vi.fn(() => {
        throw new Error('Callback error');
      });
      const goodListener = vi.fn();

      installPatch(badListener);
      installPatch(goodListener);

      localStorage.setItem('key', 'value');

      expect(badListener).toHaveBeenCalledOnce();
      expect(goodListener).toHaveBeenCalledOnce();

      // Clean up
      uninstallPatch(badListener);
      uninstallPatch(goodListener);
    });
  });

  describe('storage isolation', () => {
    it('should identify localStorage events correctly', () => {
      installPatch(listener);
      localStorage.setItem('key', 'local');

      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.storage).toBe(localStorage);
    });

    it('should identify sessionStorage events correctly', () => {
      installPatch(listener);
      sessionStorage.setItem('key', 'session');

      const event: StorageMutationEvent = listener.mock.calls[0][0];
      expect(event.storage).toBe(sessionStorage);
    });

    it('should dispatch separate events for each storage type', () => {
      installPatch(listener);
      localStorage.setItem('key', 'local');
      sessionStorage.setItem('key', 'session');

      expect(listener).toHaveBeenCalledTimes(2);

      const event1: StorageMutationEvent = listener.mock.calls[0][0];
      const event2: StorageMutationEvent = listener.mock.calls[1][0];

      expect(event1.storage).toBe(localStorage);
      expect(event1.newValue).toBe('local');
      expect(event2.storage).toBe(sessionStorage);
      expect(event2.newValue).toBe('session');
    });
  });
});
