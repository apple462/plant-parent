/**
 * EncyclopediaListScreen — search + browse the bundled offline species list.
 *
 * Task 19.1 REPLACES the placeholder created by task 14.2.
 * Jungle UI overhaul: the screen now sits on the calm `JungleBackground`
 * canopy, rows are elevated `surface` cards with leading/affordance icons, and
 * the list reserves bottom padding so the last rows clear the floating tab bar.
 *
 * Behaviour:
 * - A search field drives a local `query` string. The displayed list is derived
 *   with `useMemo(() => EncyclopediaService.search(query), [query])`, so it
 *   re-filters in real time on every keystroke (Req 7.3).
 * - `EncyclopediaService.search('')` returns the full collection, so clearing
 *   the field restores the complete unfiltered list (Req 7.3).
 * - When the query matches no entries, a "No results found" message is rendered
 *   in place of the list (Req 7.7).
 * - Each row shows the common + scientific name and navigates to the species
 *   detail route `/(tabs)/encyclopedia/[speciesId]` on press.
 *
 * Requirements: 7.3, 7.7
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { WeatherBackground } from '@/components/weather/WeatherBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/ui';
import {
    BorderRadius,
    Elevation,
    Palette,
    SemanticColors,
    Space,
    TabBarClearance,
    Typography,
} from '@/constants/theme';
import { EncyclopediaService, type SpeciesEntry } from '@/services/EncyclopediaService';

export default function EncyclopediaListScreen() {
  const [query, setQuery] = useState('');

  // Real-time derived list: recomputed on every query change (Req 7.3).
  // An empty query yields the full unfiltered collection.
  const results = useMemo<SpeciesEntry[]>(
    () => EncyclopediaService.search(query),
    [query],
  );

  const hasResults = results.length > 0;

  function handlePressSpecies(item: SpeciesEntry) {
    // Relative push within the encyclopedia stack -> [speciesId] route.
    router.push(`/encyclopedia/${item.id}`);
  }

  return (
    <WeatherBackground>
      <View style={styles.container}>
        <ScreenHeader title="Encyclopedia" />
        <View style={styles.searchRow}>
          <Input
            containerStyle={styles.searchInput}
            label="Search"
            leftIcon="search"
            placeholder="Search by common or scientific name"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {hasResults ? (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.commonName}, ${item.scientificName}`}
                onPress={() => handlePressSpecies(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.rowIconChip}>
                  <Icon name="leaf" size={22} color={SemanticColors.primary} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.commonName} numberOfLines={1}>{item.commonName}</Text>
                  <Text style={styles.scientificName} numberOfLines={1}>{item.scientificName}</Text>
                  <View style={styles.lightRow}>
                    <Icon name="sun" size={13} color={SemanticColors.warning} />
                    <Text style={styles.lightText}>{item.lightRequirement}</Text>
                  </View>
                </View>
                <Icon name="forward" size={22} color={SemanticColors.textSecondary} />
              </Pressable>
            )}
          />
        ) : (
          <View style={styles.emptyState}>
            <Icon name="search" size={48} color={SemanticColors.primary} />
            <Text style={styles.emptyTitle}>No species found</Text>
            <Text style={styles.emptyText}>Try a different common or scientific name.</Text>
          </View>
        )}
      </View>
    </WeatherBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Transparent so the JungleBackground canopy shows through.
    backgroundColor: 'transparent',
  },
  searchRow: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  searchInput: {
    alignSelf: 'stretch',
  },
  listContent: {
    paddingHorizontal: Space.md,
    // Clear the floating tab bar so the last rows stay tappable.
    paddingBottom: TabBarClearance,
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  rowPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  rowIconChip: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.green[50],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  commonName: {
    ...Typography.bodyBold,
    color: SemanticColors.textPrimary,
  },
  scientificName: {
    ...Typography.caption,
    fontStyle: 'italic',
    color: SemanticColors.textSecondary,
  },
  lightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: 2,
  },
  lightText: {
    ...Typography.label,
    color: SemanticColors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
    gap: Space.sm,
  },
  emptyTitle: {
    ...Typography.heading,
    color: SemanticColors.textPrimary,
  },
  emptyText: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
  },
});
