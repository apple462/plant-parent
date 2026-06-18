import { StyleSheet, Text, View } from 'react-native';

import {
    BorderRadius,
    CareStatus,
    CareStatusColors,
    FontSize,
    FontWeight,
    Space,
} from '@/constants/theme';

export type { CareStatus } from '@/constants/theme';

export interface CareTaskBadgeProps {
  /** The care-task status this badge represents. */
  status: CareStatus;
}

/** Short, human-readable label shown inside the pill for each status. */
const STATUS_LABELS: Record<CareStatus, string> = {
  'due-today': 'Due today',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
  none: 'No tasks',
};

/** Longer accessibility description for each status. */
const STATUS_A11Y_LABELS: Record<CareStatus, string> = {
  'due-today': 'Care task due today',
  overdue: 'Care task overdue',
  upcoming: 'Care task upcoming',
  none: 'No care tasks scheduled',
};

/**
 * CareTaskBadge renders a small pill indicating a plant's care-task status
 * with a visually distinguishable colour per state (Req 2.3).
 *
 * Colours are indexed directly from `CareStatusColors` by the `status` prop:
 * the pill uses `background`, the text uses `foreground`, and the outline uses
 * `border`.
 */
export function CareTaskBadge({ status }: CareTaskBadgeProps) {
  const colors = CareStatusColors[status];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={STATUS_A11Y_LABELS[status]}
      style={[
        styles.badge,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.label, { color: colors.foreground }]} numberOfLines={1}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
