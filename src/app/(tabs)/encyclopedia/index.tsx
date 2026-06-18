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
import { JungleBackground } from '@/components/JungleBackground';
import { Input } from '@/components/ui';
import {
    BorderRadius,
    Elevation,
    FontSize,
    FontWeight,
    SemanticColors,
    Space,
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
    <JungleBackground>
      <View style={styles.container}>
        <View style={styles.searchRow}>
          {/* Decorative leading glyph hinting at the search field. */}
          <Icon
            name="search"
            size={20}
            color={SemanticColors.textSecondary}
            style={styles.searchIcon}
          />
          <Input
            containerStyle={styles.searchInput}
            label="Search"
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
                <Icon name="leaf" size={22} color={SemanticColors.primary} />
                <View style={styles.rowText}>
                  <Text style={styles.commonName}>{item.commonName}</Text>
                  <Text style={styles.scientificName}>{item.scientificName}</Text>
                </View>
                <Icon name="forward" size={22} color={SemanticColors.textSecondary} />
              </Pressable>
            )}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No results found</Text>
          </View>
        )}
      </View>
    </JungleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Transparent so the JungleBackground canopy shows through.
    backgroundColor: 'transparent',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  searchIcon: {
    // Nudge down so it aligns with the input field, not the label above it.
    marginTop: Space.lg,
  },
  searchInput: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Space.md,
    // Clear the floating tab bar so the last rows stay tappable.
    paddingBottom: Space.xxl * 2,
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
    ...Elevation.sm,
  },
  rowPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  rowText: {
    flex: 1,
    gap: Space.xs,
  },
  commonName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: SemanticColors.textPrimary,
  },
  scientificName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    fontStyle: 'italic',
    color: SemanticColors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.lg,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: SemanticColors.textSecondary,
  },
});
