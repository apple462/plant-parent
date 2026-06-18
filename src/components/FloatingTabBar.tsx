/**
 * FloatingTabBar — a custom floating (iOS-style) bottom tab bar for Expo
 * Router's `<Tabs tabBar={(props) => <FloatingTabBar {...props} />}>`.
 *
 * It renders a rounded "pill" that floats above the screen near the bottom
 * (respecting the safe-area inset), casts a soft green-tinted shadow, and tints
 * the active tab with the brand primary colour over a muted highlight.
 *
 * Consumers (screens) should add bottom content padding so scrollable content
 * isn't hidden behind the floating bar — that is handled in the screen tasks.
 */
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import {
    BorderRadius,
    Elevation,
    FontSize,
    FontWeight,
    SemanticColors,
    Space,
} from '@/constants/theme';

/** Maps a tab route name to a semantic `Icon` name. */
const ROUTE_ICONS: Record<string, IconName> = {
  index: 'home',
  encyclopedia: 'encyclopedia',
  settings: 'settings',
};

/** Resolves the human-readable label for a tab from its descriptor options. */
function resolveLabel(
  options: BottomTabBarProps['descriptors'][string]['options'],
  fallback: string,
): string {
  const { tabBarLabel, title } = options;
  if (typeof tabBarLabel === 'string') return tabBarLabel;
  if (typeof title === 'string') return title;
  return fallback;
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { bottom: insets.bottom + Space.sm }]}
      pointerEvents="box-none">
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = resolveLabel(options, route.name);
          const iconName: IconName = ROUTE_ICONS[route.name] ?? 'leaf';
          const tint = isFocused ? SemanticColors.primary : SemanticColors.textSecondary;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tab}>
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <Icon name={iconName} size={24} color={tint} />
              </View>
              <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    alignSelf: 'center',
    marginHorizontal: Space.lg,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: SemanticColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SemanticColors.border,
    ...Elevation.lg,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 32,
    borderRadius: BorderRadius.full,
  },
  iconWrapActive: {
    backgroundColor: SemanticColors.primaryMuted,
  },
  label: {
    marginTop: 2,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});
