import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BorderRadius, FontSize, FontWeight, SemanticColors, Space } from '@/constants/theme';

/**
 * Stable identifiers for the app's user-facing error copy. Using an enum keeps
 * messaging centralised so wording can be updated in one place (design Error
 * Handling section, Req 9.5).
 */
export enum ErrorCode {
  /** A database write (create/update/delete) failed. */
  DB_WRITE_FAILED = 'DB_WRITE_FAILED',
  /** Loading data from the database failed or timed out. */
  DB_LOAD_FAILED = 'DB_LOAD_FAILED',
  /** Writing a file (e.g. a photo) to local storage failed. */
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  /** A required OS permission was denied (notifications, camera, gallery). */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** A selected photo had an unsupported format or exceeded the size limit. */
  PHOTO_INVALID = 'PHOTO_INVALID',
  /** A plant display name failed validation. */
  NAME_INVALID = 'NAME_INVALID',
  /** Fallback for unexpected errors. */
  GENERIC = 'GENERIC',
}

/** Maps each {@link ErrorCode} to its user-facing message. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.DB_WRITE_FAILED]: 'Unable to save changes. Please try again.',
  [ErrorCode.DB_LOAD_FAILED]: 'Unable to load your plants. Please try again.',
  [ErrorCode.FILE_WRITE_FAILED]: 'Unable to save the photo. Please try again.',
  [ErrorCode.PERMISSION_DENIED]: 'Permission denied. Please enable access in your device settings.',
  [ErrorCode.PHOTO_INVALID]: 'Please choose a JPEG or PNG image up to 10 MB.',
  [ErrorCode.NAME_INVALID]: 'Please enter a name between 1 and 100 characters.',
  [ErrorCode.GENERIC]: 'Something went wrong. Please try again.',
};

export interface ErrorBannerProps {
  /** Error code whose message will be displayed. Ignored if `message` is set. */
  code?: ErrorCode;
  /** Free-form message that overrides the code-derived message. */
  message?: string;
  /** Optional dismiss handler; when provided a close button is rendered. */
  onDismiss?: () => void;
  /** Optional style override for the outer container. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared error banner that renders a user-facing message from an
 * {@link ErrorCode} or a free-form string. Mounted in the root layout and
 * listened to via the UI store (Req 9.5).
 *
 * Renders nothing when neither `code` nor `message` is supplied.
 */
export function ErrorBanner({ code, message, onDismiss, style }: ErrorBannerProps) {
  const resolved = message ?? (code != null ? ERROR_MESSAGES[code] : undefined);

  if (!resolved) {
    return null;
  }

  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.container, style]}>
      <Text style={styles.message}>{resolved}</Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
          hitSlop={Space.sm}
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}>
          <Text style={styles.dismissLabel}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: SemanticColors.error,
    backgroundColor: SemanticColors.errorMuted,
  },
  message: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: SemanticColors.error,
  },
  dismiss: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissPressed: {
    opacity: 0.6,
  },
  dismissLabel: {
    fontSize: FontSize.md,
    color: SemanticColors.error,
  },
});
