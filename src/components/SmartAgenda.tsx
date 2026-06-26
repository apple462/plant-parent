/**
 * SmartAgenda — the home dashboard's prioritised care plan (local feature).
 *
 * Replaces the flat "Today's tasks" checklist with a context-aware agenda built
 * by the pure {@link buildAgenda} helper:
 *   - "Needs attention" — overdue tasks, most overdue first, with a "Nd overdue"
 *     badge so the urgent ones stand out.
 *   - "Due today"        — today's tasks.
 *   - "Coming up"        — a short, non-actionable look-ahead.
 *
 * Watering rows can show a smart hint pulled from the live weather + season
 * (e.g. "Rain expected — watering can wait", "Winter dormancy — water
 * sparingly"). The weather/season context is read here from the stores so the
 * home screen stays simple; the prioritisation logic itself stays pure/testable
 * in `utils/agenda`.
 *
 * Rows animate in (Reanimated `FadeInDown`) and animate out (`FadeOut` +
 * `Layout`) when a task is completed and the live query drops it — a smooth,
 * physical removal rather than a jump. Motion is skipped under Reduce-Motion.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui';
import {
  BorderRadius,
  Elevation,
  Palette,
  SemanticColors,
  Space,
  Typography,
} from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { CareType } from '@/services/CareService';
import { useWeatherStore } from '@/stores/weatherStore';
import { buildAgenda, type AgendaItem, type AgendaSource } from '@/utils/agenda';
import { formatDDMMYYYY } from '@/utils/dateUtils';
import { getSeason, hemisphereForLatitude } from '@/utils/seasons';
import { RAIN_SKIP_THRESHOLD_MM } from '@/utils/weatherFactor';

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

export interface SmartAgendaProps {
  /** All care-schedule rows across the Plant_Kingdom. */
  rows: AgendaSource[];
  /** Map of plant id → display name. */
  plantNameById: Map<string, string>;
  /** The schedule id currently being completed (drives the row spinner). */
  completingId: string | null;
  /** Mark a schedule's task done. */
  onComplete: (scheduleId: string) => void;
}

export function SmartAgenda({ rows, plantNameById, completingId, onComplete }: SmartAgendaProps) {
  const reducedMotion = useReducedMotion();
  const weather = useWeatherStore((s) => s.weather);
  const adjustEnabled = useWeatherStore((s) => s.adjustEnabled);
  const latitude = useWeatherStore((s) => s.location?.lat ?? null);

  const agenda = useMemo(() => {
    const today = weather?.daily?.[0];
    const skipForRain =
      adjustEnabled && today ? today.precipitationSum >= RAIN_SKIP_THRESHOLD_MM : false;
    const season = getSeason(new Date(), hemisphereForLatitude(latitude));
    return buildAgenda(rows, { watering: { skipForRain, season } });
  }, [rows, weather, adjustEnabled, latitude]);

  // Nothing to show — let the caller's other sections fill the space.
  if (agenda.overdue.length === 0 && agenda.dueToday.length === 0 && agenda.upcoming.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {agenda.overdue.length > 0 ? (
        <Section title="Needs attention" tone="overdue">
          {agenda.overdue.map((item, index) => (
            <AgendaRow
              key={item.scheduleId}
              item={item}
              index={index}
              plantName={plantNameById.get(item.plantId) ?? 'Plant'}
              completingId={completingId}
              onComplete={onComplete}
              reducedMotion={reducedMotion}
            />
          ))}
        </Section>
      ) : null}

      {agenda.dueToday.length > 0 ? (
        <Section title="Due today" tone="today">
          {agenda.dueToday.map((item, index) => (
            <AgendaRow
              key={item.scheduleId}
              item={item}
              index={index}
              plantName={plantNameById.get(item.plantId) ?? 'Plant'}
              completingId={completingId}
              onComplete={onComplete}
              reducedMotion={reducedMotion}
            />
          ))}
        </Section>
      ) : null}

      {agenda.upcoming.length > 0 ? (
        <Section title="Coming up" tone="upcoming">
          {agenda.upcoming.map((item) => (
            <View key={item.scheduleId} style={styles.upcomingRow}>
              <Icon name={TYPE_ICON[item.type]} size={16} color={SemanticColors.textSecondary} />
              <Text style={styles.upcomingText} numberOfLines={1}>
                {TYPE_LABEL[item.type]} · {plantNameById.get(item.plantId) ?? 'Plant'}
              </Text>
              <Text style={styles.upcomingDate}>{formatDDMMYYYY(item.nextDueAt)}</Text>
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

type Tone = 'overdue' | 'today' | 'upcoming';

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.toneDot, TONE_DOT[tone]]} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function AgendaRow({
  item,
  index,
  plantName,
  completingId,
  onComplete,
  reducedMotion,
}: {
  item: AgendaItem;
  index: number;
  plantName: string;
  completingId: string | null;
  onComplete: (scheduleId: string) => void;
  reducedMotion: boolean;
}) {
  const isCompleting = completingId === item.scheduleId;
  const overdue = item.status === 'overdue';

  const content = (
    <View style={[styles.row, Elevation.sm]}>
      <View style={[styles.iconChip, overdue && styles.iconChipOverdue]}>
        <Icon
          name={TYPE_ICON[item.type]}
          size={18}
          color={overdue ? SemanticColors.error : SemanticColors.primary}
        />
      </View>
      <View style={styles.textGroup}>
        <Text style={styles.plantName} numberOfLines={1}>
          {plantName}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.taskLabel}>{TYPE_LABEL[item.type]}</Text>
          {overdue ? (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>
                {item.overdueDays === 0
                  ? 'overdue'
                  : `${item.overdueDays}d overdue`}
              </Text>
            </View>
          ) : null}
        </View>
        {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
      </View>
      <Button
        label={isCompleting ? 'Saving…' : 'Done'}
        variant="secondary"
        loading={isCompleting}
        disabled={completingId !== null}
        onPress={() => onComplete(item.scheduleId)}
        accessibilityLabel={`Mark ${TYPE_LABEL[item.type].toLowerCase()} done for ${plantName}`}
        style={styles.doneButton}
      />
    </View>
  );

  if (reducedMotion) {
    return content;
  }
  return (
    <Animated.View
      entering={FadeInDown.duration(320).delay(Math.min(index, 6) * 40)}
      exiting={FadeOut.duration(220)}
      layout={LinearTransition.springify().damping(18)}>
      {content}
    </Animated.View>
  );
}

const TONE_DOT: Record<Tone, { backgroundColor: string }> = {
  overdue: { backgroundColor: SemanticColors.error },
  today: { backgroundColor: SemanticColors.warning },
  upcoming: { backgroundColor: SemanticColors.textSecondary },
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Space.sm,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  section: {
    gap: Space.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  toneDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  sectionTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  sectionBody: {
    gap: Space.sm,
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
    backgroundColor: SemanticColors.primaryMuted,
  },
  iconChipOverdue: {
    backgroundColor: SemanticColors.errorMuted,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  plantName: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  taskLabel: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  overdueBadge: {
    paddingHorizontal: Space.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    backgroundColor: SemanticColors.errorMuted,
  },
  overdueBadgeText: {
    ...Typography.label,
    color: SemanticColors.error,
  },
  hint: {
    ...Typography.label,
    color: Palette.blue[700],
  },
  doneButton: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
  },
  upcomingText: {
    flex: 1,
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  upcomingDate: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
});

export default SmartAgenda;
