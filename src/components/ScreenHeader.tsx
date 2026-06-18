/**
 * ScreenHeader — the single, shared header band used across every screen.
 *
 * Replaces native Expo Router headers everywhere (see `_layout.tsx` files,
 * which all set `headerShown: false`) so the header always sits seamlessly on
 * top of `JungleBackground` instead of a platform-styled native bar with its
 * own background/shadow and (on iOS) a "< Previous Title" back button.
 *
 * Nested/pushed screens pass `onBack` to get an icon-only back button (no
 * label, per design) — top-level tab screens omit it and the title simply
 * leads the row.
 *
 * Manages its own top safe-area inset via `useSafeAreaInsets`, so screens
 * using this component should NOT also reserve the top edge with a
 * `SafeAreaView edges={['top']}` (that would double the inset).
 */
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { BorderRadius, SemanticColors, Space, Typography } from '@/constants/theme';

export interface ScreenHeaderProps {
  /** Title text. Omit for a header that only shows a back button / right slot. */
  title?: string;
  /** When provided, renders an icon-only back button that calls this on press. */
  onBack?: () => void;
  /** Optional trailing content (e.g. a future action button), right-aligned. */
  right?: React.ReactNode;
  /** Optional style override for the outer container. */
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({ title, onBack, right, style }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + Space.sm }, style]}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={Space.sm}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Icon name="back" size={24} color={SemanticColors.textPrimary} />
        </Pressable>
      ) : null}
      {title ? (
        <Text style={[styles.title, !onBack && styles.titleNoBack]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={styles.rightSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingBottom: Space.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  backButtonPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  title: {
    flex: 1,
    ...Typography.heading,
    color: SemanticColors.textPrimary,
  },
  titleNoBack: {
    paddingLeft: Space.xs,
  },
  rightSlot: {
    minWidth: 4,
  },
});
