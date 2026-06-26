/**
 * CareHistoryList — a reverse-chronological log of care completions across all
 * of a plant's schedules (watering / fertilising / pruning).
 *
 * Each row carries a tinted type icon, a human label, and the completion
 * timestamp ("DD MMM YYYY, HH:MM"). Rows animate in with a gentle staggered
 * fade/slide (Reanimated layout animations), capped so a long history doesn't
 * cascade forever. Motion is skipped under Reduce-Motion.
 */
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import {
  BorderRadius,
  Elevation,
  SemanticColors,
  Space,
  TabBarClearance,
  Typography,
} from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { CareType } from '@/services/CareService';
import { formatJournalTimestamp } from '@/utils/dateUtils';
import type { CareHistoryEvent } from '@/utils/careHistory';

/** Semantic icon per care type. */
const TYPE_ICON: Record<CareType, IconName> = {
  watering: 'water',
  fertilising: 'fertilise',
  pruning: 'prune',
};

/** Tint per care type (matches the plant-profile care sections). */
const TYPE_TINT: Record<CareType, { fg: string; bg: string }> = {
  watering: { fg: SemanticColors.info, bg: SemanticColors.infoMuted },
  fertilising: { fg: SemanticColors.warning, bg: SemanticColors.warningMuted },
  pruning: { fg: SemanticColors.primary, bg: SemanticColors.primaryMuted },
};

const TYPE_LABEL: Record<CareType, string> = {
  watering: 'Watered',
  fertilising: 'Fertilised',
  pruning: 'Pruned',
};

/** Cap the entrance stagger so a long log doesn't animate forever. */
const MAX_STAGGER_INDEX = 8;

export interface CareHistoryListProps {
  events: CareHistoryEvent[];
  /** Rendered above the list (e.g. the streak summary). */
  ListHeaderComponent?: React.ComponentType<unknown> | React.ReactElement | null;
  /** Rendered when there are no events. */
  ListEmptyComponent?: React.ComponentType<unknown> | React.ReactElement | null;
}

function keyExtractor(event: CareHistoryEvent): string {
  return `${event.scheduleId}-${event.completedAt.getTime()}`;
}

export function CareHistoryList({
  events,
  ListHeaderComponent,
  ListEmptyComponent,
}: CareHistoryListProps) {
  const reducedMotion = useReducedMotion();

  const renderItem = ({ item, index }: ListRenderItemInfo<CareHistoryEvent>) => {
    const tint = TYPE_TINT[item.type];
    const row = (
      <View style={[styles.row, Elevation.sm]}>
        <View style={[styles.iconChip, { backgroundColor: tint.bg }]}>
          <Icon name={TYPE_ICON[item.type]} size={18} color={tint.fg} />
        </View>
        <View style={styles.textGroup}>
          <Text style={styles.label}>{TYPE_LABEL[item.type]}</Text>
          <Text style={styles.timestamp}>{formatJournalTimestamp(item.completedAt)}</Text>
        </View>
      </View>
    );

    if (reducedMotion) {
      return row;
    }
    return (
      <Animated.View
        entering={FadeInDown.duration(360).delay(Math.min(index, MAX_STAGGER_INDEX) * 45)}>
        {row}
      </Animated.View>
    );
  };

  return (
    <FlatList
      data={events}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={styles.content}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.md,
    gap: Space.sm,
    paddingBottom: TabBarClearance,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  timestamp: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
});

export default CareHistoryList;
