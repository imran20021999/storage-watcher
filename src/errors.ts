/**
 * Custom error classes for storage-watcher.
 * Follows the same hierarchy pattern as encrypt-storage-lite.
 */

/** Base error class for all storage-watcher errors. */
export class StorageWatcherError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StorageWatcherError';
  }
}

/** Thrown when the specified storage backend is not available. */
export class StorageUnavailableError extends StorageWatcherError {
  constructor(storageType: string, options?: ErrorOptions) {
    super(
      `Storage backend "${storageType}" is not available. ` +
        'This may be due to a private/incognito browser mode or disabled cookies.',
      options,
    );
    this.name = 'StorageUnavailableError';
  }
}

/** Thrown when a method is called on a destroyed StorageWatcher instance. */
export class AlreadyDestroyedError extends StorageWatcherError {
  constructor(method: string, options?: ErrorOptions) {
    super(
      `Cannot call ${method}() on a destroyed StorageWatcher instance. ` +
        'Create a new instance to continue watching.',
      options,
    );
    this.name = 'AlreadyDestroyedError';
  }
}
