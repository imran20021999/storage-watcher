# storage-watcher

A **zero-dependency**, lightweight npm package that lets you subscribe to `localStorage` and `sessionStorage` changes in real-time within the same browser tab.

Normally, there's no way to know when a value in storage changes within the **same tab** — the browser's native `storage` event only fires in *other* tabs. This package solves that by intercepting storage write operations and notifying your callbacks instantly.

## Installation

```bash
npm install storage-watcher
```

## Quick Start

```ts
import { StorageWatcher } from 'storage-watcher';

const watcher = new StorageWatcher();

// Watch a specific key
const unsub = watcher.on('user-token', (newValue, oldValue) => {
  console.log(`Token changed: ${oldValue} → ${newValue}`);
});

// Later, when done watching
unsub();

// Clean up everything
watcher.destroy();
```

## API

### `new StorageWatcher(options?)`

Creates a new watcher instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `storageType` | `'localStorage' \| 'sessionStorage'` | `'localStorage'` | Which storage backend to watch |

```ts
// Watch localStorage (default)
const watcher = new StorageWatcher();

// Watch sessionStorage
const sessionWatcher = new StorageWatcher({ storageType: 'sessionStorage' });
```

---

### `watcher.on(key, callback)` → `Unsubscribe`

Watch a **specific key** for changes. Works even if the key **doesn't exist yet** — the callback fires the moment the key is created.

```ts
// Watch an existing key
watcher.on('theme', (newValue, oldValue) => {
  console.log(`Theme changed from ${oldValue} to ${newValue}`);
});

// Watch a key that doesn't exist yet (future key)
watcher.on('future-config', (newValue, oldValue) => {
  // oldValue will be null (key didn't exist before)
  console.log(`Config was created with value: ${newValue}`);
});
```

**Callback signature:** `(newValue: string | null, oldValue: string | null) => void`

- `newValue` is `null` when the key is removed or cleared
- `oldValue` is `null` when the key is newly created

---

### `watcher.onAny(callback)` → `Unsubscribe`

Watch **all key changes** across the storage.

```ts
watcher.onAny((key, newValue, oldValue) => {
  console.log(`${key} changed: ${oldValue} → ${newValue}`);
});
```

**Callback signature:** `(key: string, newValue: string | null, oldValue: string | null) => void`

---

### `watcher.onNew(callback)` → `Unsubscribe`

Watch for **brand-new keys** being added to storage. Fires only when a key that didn't previously exist is created via `setItem()`.

```ts
watcher.onNew((key, value) => {
  console.log(`New key "${key}" created with value: ${value}`);
});

localStorage.setItem('brand-new', 'hello');  // ✅ fires (new key)
localStorage.setItem('brand-new', 'world');  // ❌ doesn't fire (key already exists)
localStorage.removeItem('brand-new');
localStorage.setItem('brand-new', 'again');  // ✅ fires (key was removed, now re-created)
```

**Callback signature:** `(key: string, value: string) => void`

---

### `watcher.destroy()`

Destroy the watcher instance. Removes all listeners and cleans up internal patches. After calling `destroy()`, any calls to `on()`, `onAny()`, or `onNew()` will throw an `AlreadyDestroyedError`.

```ts
watcher.destroy();
```

This method is **idempotent** — calling it multiple times is safe.

---

### Unsubscribe

All watch methods return an unsubscribe function:

```ts
const unsub = watcher.on('key', callback);

// Stop watching this specific callback
unsub();

// Calling again is safe (idempotent)
unsub();
```

## How It Works

The package monkey-patches `Storage.prototype.setItem`, `.removeItem`, and `.clear` to intercept mutations. Key details:

- **Reference counted** — patches are installed when the first `StorageWatcher` instance is created and restored when the last instance is destroyed
- **Multiple instances** — you can create multiple watchers (even for different storage types) and they coexist safely
- **`clear()` handling** — when `clear()` is called, individual events fire for each key that existed, so per-key watchers work correctly
- **Error isolation** — if one callback throws, other callbacks and the storage operation itself are not affected

## Events Fired

| Storage Operation | `on(key)` | `onAny()` | `onNew()` |
|-------------------|-----------|-----------|-----------|
| `setItem(key, value)` — new key | ✅ | ✅ | ✅ |
| `setItem(key, value)` — existing key | ✅ | ✅ | ❌ |
| `removeItem(key)` | ✅ | ✅ | ❌ |
| `clear()` | ✅ (per key) | ✅ (per key) | ❌ |

## Error Handling

| Error | When |
|-------|------|
| `StorageUnavailableError` | Storage backend is not available (e.g., private browsing) |
| `AlreadyDestroyedError` | Method called on a destroyed instance |

Both extend `StorageWatcherError`, which extends `Error`.

```ts
import { StorageWatcherError, AlreadyDestroyedError } from 'storage-watcher';

try {
  watcher.on('key', cb);
} catch (err) {
  if (err instanceof AlreadyDestroyedError) {
    // handle destroyed instance
  }
}
```

## TypeScript

Full TypeScript support with exported types:

```ts
import type {
  StorageWatcherOptions,
  StorageType,
  WatchCallback,
  WatchAnyCallback,
  WatchNewCallback,
  Unsubscribe,
} from 'storage-watcher';
```

## License

MIT
