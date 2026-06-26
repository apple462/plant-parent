/**
 * CareHistoryScreen — a plant's care streaks + completion log
 * (`/plants/[plantId]/history`).
 *
 * Surfaces the local care-history feature: a hero {@link StreakRing} for the
 * plant's best active streak, summary stats (total completions, best streak
 * ever), a per-care-type streak breakdown, and a reverse-chronological log of
 * every completion ({@link CareHistoryList}).
 *
 * Reads are reactive via {@link useCareHistory} (Drizzle live queries over
 * `care_schedules` + `care_completions`), so marking a task done anywhere in
 * the app updates the streaks here immediately. All data is local; no schema
 * change was needed (it derives from the existing `care_completions` table).
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CareHistoryList } from '@/components/care/CareHistoryList';
import { StreakRing } from '@/components/care/StreakRing';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { WeatherBackground } from '@/components/weather/WeatherBackground';
import { LoadingSpinner } from '@/components/ui';
import {
  BorderRadius,
  Elevation,
  SemanticColors,
  Space,
  Typography,
} from '@/constants/theme';
import { useCareHistory } from '@/hooks/useCareHistory';
import { usePlants } from '@/hooks/usePlants';
import type { CareType } from '@/services/CareService';
import { progressToNextMilestone } from '@/utils/careHistory';

const TYPE_ICON: Record<CareType, IconName> = {
  watering: 'water',
  fertilising: 'fertilise',
  pruning: 'prune',
};

const TYPE_LABEL: Record<CareType, string> = {
  watering: 'Watering',
  fertilising: 'Fertilising',
  pruning: 'Pruning',
};

export default function CareHistoryScreen() {
  const { plantId } = useLocalSearchParams<{ plantId: string }>();
  const router = useRouter();

  const { plants } = usePlants();
  const plant = useMemo(() => plants.find((p) => p.id === plantId), [plants, plantId]);

  const { streaks, history, bestCurrentStreak, bestStreakEver, totalCompletions, isLoading } =
    useCareHistory(plantId);

  const ringProgress = useMemo(
    () => progressToNextMilestone(bestCurrentStreak),
    [bestCurrentStreak],
  );

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.hero}>
        <StreakRing
          current={bestCurrentStreak}
          fraction={ringProgress.fraction}
          active={bestCurrentStreak > 0}
          caption={bestCurrentStreak > 0 ? 'day streak' : 'start a streak'}
        />
        <Text style={styles.heroHint}>
          {bestCurrentStreak > 0
            ? `${ringProgress.to - bestCurrentStreak} to your next ${ringProgress.to}-streak milestone`
            : 'Mark a care task done to begin a streak.'}
        </Text>
      </View>

      <View style={styles.statRow}>
        <StatCard icon="check" label="Completed" value={String(totalCompletions)} />
        <StatCard icon="fire" label="Best ever" value={String(bestStreakEver)} />
      </View>

      {streaks.length > 0 ? (
        <View style={styles.breakdown}>
          <Text style={styles.sectionLabel}>By care type</Text>
          {streaks.map((s) => (
            <View key={s.scheduleId} style={[styles.typeRow, Elevation.sm]}>
              <View style={styles.typeLabelGroup}>
                <Icon name={TYPE_ICON[s.type]} size={18} color={SemanticColors.primary} />
                <Text style={styles.typeName}>{TYPE_LABEL[s.type]}</Text>
              </View>
              <View style={styles.typeStats}>
                <Text style={styles.typeStat}>
                  <Text style={styles.typeStatStrong}>{s.streak.current}</Text>
                  {s.streak.active ? ' now' : ' lapsed'}
                </Text>
                <Text style={styles.typeStatMuted}>best {s.streak.longest}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {history.length > 0 ? <Text style={styles.sectionLabel}>History</Text> : null}
    </View>
  );

  return (
    <WeatherBackground>
      <View style={styles.flex}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader
          title={plant ? `${plant.displayName} — History` : 'Care History'}
          onBack={() => router.back()}
        />
        {isLoading ? (
          <LoadingSpinner label="Loading history…" />
        ) : (
          <CareHistoryList
            events={history}
            ListHeaderComponent={header}
            ListEmptyComponent={<EmptyState />}
          />
        )}
      </View>
    </WeatherBackground>
  );
}

function StatCard({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={[styles.statCard, Elevation.sm]}>
      <Icon name={icon} size={20} color={SemanticColors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Icon name="history" size={48} color={SemanticColors.primary} />
      <Text style={styles.emptyTitle}>No care logged yet</Text>
      <Text style={styles.emptyBody}>
        Mark watering, fertilising, or pruning as done to build this plant&apos;s care history and
        streaks.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  headerContent: {
    gap: Space.lg,
    paddingBottom: Space.md,
  },
  hero: {
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: Space.sm,
  },
  heroHint: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
  },
  statRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: SemanticColors.surface,
  },
  statValue: {
    ...Typography.title,
    color: SemanticColors.textPrimary,
  },
  statLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  breakdown: {
    gap: Space.sm,
  },
  sectionLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Space.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
  },
  typeLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  typeName: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  typeStats: {
    alignItems: 'flex-end',
  },
  typeStat: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  typeStatStrong: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
  typeStatMuted: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
    gap: Space.sm,
  },
  emptyTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
});
