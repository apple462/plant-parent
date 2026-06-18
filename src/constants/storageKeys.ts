/**
 * Centralised AsyncStorage key constants for the Plant Parent app.
 *
 * Keeping these in one place ensures the root layout (onboarding gate),
 * onboarding flow (task 14.3), and Settings screen (task 21.1) all read and
 * write the exact same keys. See design.md "AsyncStorage Keys".
 */

/** First-launch flag. Stored as the string `'true'` once onboarding finishes. */
export const ONBOARDING_COMPLETE = 'onboarding_complete';

/** Global preferred reminder hour (0–23), stored as a numeric string. Default 8. */
export const PREFERRED_REMINDER_HOUR = 'preferred_reminder_hour';

/** Global preferred reminder minute (0–59), stored as a numeric string. Default 0. */
export const PREFERRED_REMINDER_MINUTE = 'preferred_reminder_minute';

/** User's display name, captured during onboarding. Stored as a plain string. */
export const USER_NAME = 'user_name';

/**
 * Local-only session lock. Absent or any value other than the literal string
 * `'false'` is treated as logged in (so users who completed onboarding before
 * this flag existed are never unexpectedly logged out). Logging out writes
 * the string `'false'`; logging back in writes `'true'`. This never gates
 * onboarding or touches `USER_NAME` / plant data — it is purely a privacy
 * lock the user can re-enter with one tap.
 */
export const SESSION_ACTIVE = 'session_active';
