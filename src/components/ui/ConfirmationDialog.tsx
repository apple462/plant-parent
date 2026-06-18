import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, type ButtonVariant } from '@/components/ui/Button';
import { BorderRadius, FontSize, FontWeight, MaxContentWidth, SemanticColors, Space } from '@/constants/theme';

export interface ConfirmationDialogProps {
  /** Controls dialog visibility. */
  visible: boolean;
  /** Dialog heading. */
  title: string;
  /** Supporting body copy. */
  message: string;
  /** Label for the confirm button. Defaults to `'Confirm'`. */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to `'Cancel'`. */
  cancelLabel?: string;
  /** Variant for the confirm button. Defaults to `'primary'`. */
  confirmVariant?: ButtonVariant;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user cancels or dismisses the dialog. */
  onCancel: () => void;
}

/**
 * A modal confirm / cancel dialog. Used for destructive confirmations such as
 * deleting a plant (Req 1.7) or a journal entry (Req 6.8).
 */
export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable accessibilityLabel="Dismiss dialog" style={styles.backdrop} onPress={onCancel}>
        <Pressable
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.card}
          onPress={() => {
            // Swallow presses so tapping the card does not dismiss the dialog.
          }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} style={styles.action} />
            <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} style={styles.action} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Space.md,
    padding: Space.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
  },
  message: {
    fontSize: FontSize.md,
    color: SemanticColors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  action: {
    flex: 1,
  },
});
