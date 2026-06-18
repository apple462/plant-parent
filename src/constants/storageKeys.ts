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
