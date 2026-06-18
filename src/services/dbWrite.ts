/**
 * dbWrite — shared DB-write failure handling for the service layer (task 22.1).
 *
 * Every service WRITE that touches the Local_DB runs through {@link runDbWrite},
 * which surfaces a single user-facing banner when the write fails and then
 * re-throws so callers/stores still observe the error (preserving existing
 * error-propagation contracts).
 *
 * Pattern & boundaries
 * --------------------
 *   - VALIDATION runs OUTSIDE this wrapper. Validation failures
 *     (`PlantValidationError`, the `RangeError` for an out-of-range interval,
 *     "plant/schedule does not exist" precondition checks) are NOT DB-write
 *     failures and must NOT trigger the banner. Services validate first, then
 *     pass only the actual `db.transaction(...)` write to {@link runDbWrite}.
 *   - ATOMICITY is provided by wrapping the multi-statement writes in a Drizzle
 *     `db.transaction(...)` at the call site; a throw inside the transaction
 *     callback rolls back every statement (Property 17). This wrapper only adds
 *     the banner + re-throw around that transaction.
 *   - FILE_STORE / notification side effects stay OUTSIDE the wrapped write
 *     (they are not DB-transactional).
 *
 * uiStore from a service
 * ----------------------
 * `useUiStore` is a plain Zustand store with no native dependencies, so it is
 * safe to use outside React via `getState()` and safe to import into the
 * (otherwise UI-free) services under Jest. The banner is only set on the
 * failure path, so success-path service tests that don't mock the store are
 * unaffected.
 *
 * Requirements: 9.5
 */
import { useUiStore } from '../stores/uiStore';

/** User-facing copy shown when a Local_DB write fails (Req 9.5). */
export const DB_WRITE_FAILED_MESSAGE = 'Unable to save changes. Please try again.';

/**
 * Run a Local_DB write (typically a `db.transaction(...)` call). If it throws,
 * show the global error banner and re-throw the original error so callers still
 * see the failure.
 *
 * The callback may be synchronous (better-sqlite3 / expo-sqlite transactions are
 * synchronous) or asynchronous; both are awaited uniformly.
 */
export async function runDbWrite<T>(write: () => T | Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    useUiStore.getState().setErrorBanner(DB_WRITE_FAILED_MESSAGE);
    throw error;
  }
}
