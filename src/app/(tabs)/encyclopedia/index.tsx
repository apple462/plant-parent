/**
 * EncyclopediaListScreen — search + browse the bundled offline species list.
 *
 * Task 19.1 REPLACES the placeholder created by task 14.2.
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

import { Input } from '@/components/ui';
import {
    BorderRadius,
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
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Input
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
              <Text style={styles.commonName}>{item.commonName}</Text>
              <Text style={styles.scientificName}>{item.scientificName}</Text>
            </Pressable>
          )}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SemanticColors.surface,
  },
  searchRow: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.lg,
    gap: Space.sm,
  },
  row: {
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderWidth: 1,
    borderColor: SemanticColors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: SemanticColors.surface,
    gap: Space.xs,
  },
  rowPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
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
