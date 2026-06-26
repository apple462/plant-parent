/**
 * BackupScreen — fully-local backup & restore (`/backup`).
 *
 * Lists on-device snapshots created by {@link BackupService}, and lets the user
 * create a new one, restore an existing one (replacing all current data), or
 * delete one. Everything stays on the device — there is no cloud or network.
 *
 * Restoring replaces every table's rows and copies photos back to their
 * canonical File_Store locations; because the rest of the app reads via Drizzle
 * live queries, screens reflect the restored data automatically once the
 * transaction commits.
 */
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ConfirmationDialog, LoadingSpinner, Toast } from '@/components/ui';
import { WeatherBackground } from '@/components/weather/WeatherBackground';
import {
    BorderRadius,
    Elevation,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { BackupService, type BackupSummary } from '@/services/BackupService';
import { formatJournalTimestamp } from '@/utils/dateUtils';

export default function BackupScreen() {
  const router = useRouter();

  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupSummary | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackupSummary | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const list = await BackupService.listBackups();
    setBackups(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await BackupService.listBackups();
      if (active) {
        setBackups(list);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      await BackupService.createBackup();
      await refresh();
      setToast({ message: 'Backup created', variant: 'success' });
    } catch {
      setToast({ message: 'Could not create the backup', variant: 'error' });
    } finally {
      setCreating(false);
    }
  }, [refresh]);

  const handleConfirmRestore = useCallback(async () => {
    const target = pendingRestore;
    setPendingRestore(null);
    if (!target) return;
    setBusyId(target.id);
    try {
      await BackupService.restoreBackup(target.id);
      setToast({ message: 'Backup restored', variant: 'success' });
    } catch {
      setToast({ message: 'Could not restore this backup', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }, [pendingRestore]);

  const handleConfirmDelete = useCallback(async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setBusyId(target.id);
    try {
      await BackupService.deleteBackup(target.id);
      await refresh();
      setToast({ message: 'Backup deleted', variant: 'success' });
    } finally {
      setBusyId(null);
    }
  }, [pendingDelete, refresh]);

  return (
    <WeatherBackground>
      <View style={styles.flex}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title="Backup & Restore" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.introCard, Elevation.sm]}>
            <View style={styles.introHeader}>
              <Icon name="archive" size={20} color={SemanticColors.primary} />
              <Text style={styles.introTitle}>On-device backups</Text>
            </View>
            <Text style={styles.introBody}>
              Save a snapshot of every plant, care schedule, journal photo, and care record. Backups
              stay on this device — nothing is uploaded anywhere.
            </Text>
            <Button
              label={creating ? 'Creating…' : 'Create backup'}
              icon="archive"
              loading={creating}
              disabled={creating || busyId !== null}
              onPress={() => {
                void handleCreate();
              }}
              style={styles.createButton}
            />
          </View>

          {loading ? (
            <LoadingSpinner label="Loading backups…" />
          ) : backups.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="archive" size={44} color={SemanticColors.primary} />
              <Text style={styles.emptyTitle}>No backups yet</Text>
              <Text style={styles.emptyBody}>
                Create your first backup so you can restore your jungle if you ever switch devices or
                reinstall.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              <Text style={styles.sectionLabel}>Saved backups</Text>
              {backups.map((backup) => (
                <View key={backup.id} style={[styles.row, Elevation.sm]}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowDate}>{formatJournalTimestamp(backup.createdAt)}</Text>
                    <Text style={styles.rowMeta}>
                      {backup.plantCount} {backup.plantCount === 1 ? 'plant' : 'plants'} ·{' '}
                      {backup.journalCount} photos · {backup.completionCount} care logs
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Button
                      label="Restore"
                      variant="secondary"
                      icon="restore"
                      loading={busyId === backup.id}
                      disabled={busyId !== null || creating}
                      onPress={() => setPendingRestore(backup)}
                      style={styles.rowButton}
                    />
                    <Button
                      label="Delete"
                      variant="destructive"
                      disabled={busyId !== null || creating}
                      onPress={() => setPendingDelete(backup)}
                      style={styles.rowButton}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.toastWrap} pointerEvents="box-none">
          <Toast
            message={toast?.message}
            variant={toast?.variant}
            onDismiss={() => setToast(null)}
          />
        </View>

        <ConfirmationDialog
          visible={pendingRestore !== null}
          title="Restore this backup?"
          message="This replaces all current plants, care schedules, journal photos, and records with the contents of this backup. This can't be undone."
          confirmLabel="Restore"
          confirmVariant="primary"
          onConfirm={() => {
            void handleConfirmRestore();
          }}
          onCancel={() => setPendingRestore(null)}
        />

        <ConfirmationDialog
          visible={pendingDelete !== null}
          title="Delete this backup?"
          message="This permanently removes this backup snapshot from your device. Your current data is not affected."
          confirmLabel="Delete"
          confirmVariant="destructive"
          onConfirm={() => {
            void handleConfirmDelete();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      </View>
    </WeatherBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' },
  content: {
    padding: Space.md,
    gap: Space.lg,
    paddingBottom: TabBarClearance,
  },
  introCard: {
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    padding: Space.lg,
    gap: Space.md,
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  introTitle: {
    ...Typography.subtitle,
    color: SemanticColors.textPrimary,
  },
  introBody: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
  },
  createButton: {
    alignSelf: 'stretch',
  },
  sectionLabel: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  list: {
    gap: Space.sm,
  },
  row: {
    backgroundColor: SemanticColors.surface,
    borderRadius: BorderRadius.xl,
    padding: Space.md,
    gap: Space.sm,
  },
  rowText: {
    gap: 2,
  },
  rowDate: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  rowMeta: {
    ...Typography.caption,
    color: SemanticColors.textSecondary,
  },
  rowActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  rowButton: {
    flex: 1,
    minHeight: 40,
  },
  empty: {
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.xl,
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
  toastWrap: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    bottom: Space.xl,
  },
});
