import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Input, type InputProps } from '@/components/ui/Input';
import { BorderRadius, Elevation, SemanticColors, Space, Typography } from '@/constants/theme';

export interface AutocompleteProps extends Omit<InputProps, 'value' | 'onChangeText'> {
  /** Current text value (controlled). */
  value: string;
  /** Called with the new text — typed by the user or chosen from a suggestion. */
  onChangeText: (text: string) => void;
  /** Candidate values to suggest, filtered by the current text. */
  options: string[];
  /** Max number of suggestions shown at once. Defaults to 5. */
  maxSuggestions?: number;
}

const DEFAULT_MAX_SUGGESTIONS = 5;

/**
 * A text `Input` with a filtered suggestion dropdown beneath it.
 *
 * Free text entry is always available — this never blocks typing a new
 * value. The dropdown is purely a shortcut onto an existing option (matched
 * case-insensitively, by substring, against the current text): tapping a row
 * fills the field with that exact value, same as typing it out. Hidden
 * whenever there are no matches, so an unmatched new entry never shows an
 * empty box.
 */
export function Autocomplete({
  value,
  onChangeText,
  options,
  maxSuggestions = DEFAULT_MAX_SUGGESTIONS,
  onFocus,
  onBlur,
  ...inputProps
}: AutocompleteProps) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const needle = value.trim().toLowerCase();
    const pool =
      needle.length === 0
        ? options
        : options.filter(
            (option) => option.toLowerCase().includes(needle) && option.toLowerCase() !== needle,
          );
    return pool.slice(0, maxSuggestions);
  }, [options, value, maxSuggestions]);

  const showDropdown = focused && suggestions.length > 0;

  function handleSelect(option: string) {
    onChangeText(option);
    setFocused(false);
  }

  return (
    <View>
      <Input
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Delay hiding so a tap on a suggestion row registers first — blur
          // can fire before the row's onPress on some platforms.
          setTimeout(() => setFocused(false), 150);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {showDropdown ? (
        <View style={styles.dropdown}>
          {suggestions.map((option, index) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityLabel={`Use "${option}"`}
              onPress={() => handleSelect(option)}
              style={({ pressed }) => [
                styles.row,
                index < suggestions.length - 1 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}>
              <Text style={styles.rowText} numberOfLines={1}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    marginTop: Space.xs,
    borderRadius: BorderRadius.lg,
    backgroundColor: SemanticColors.surface,
    overflow: 'hidden',
    ...Elevation.md,
  },
  row: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SemanticColors.border,
  },
  rowPressed: {
    backgroundColor: SemanticColors.surfaceMuted,
  },
  rowText: {
    ...Typography.body,
    color: SemanticColors.textPrimary,
  },
});

export default Autocomplete;
