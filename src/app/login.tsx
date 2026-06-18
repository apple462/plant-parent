/**
 * LoginScreen — the local-only session lock screen (`/login`).
 *
 * Plant Parent has no real authentication: there is no server, no account,
 * and no session token. "Logging out" (Settings → Log out) simply writes
 * `SESSION_ACTIVE = 'false'` to AsyncStorage and sends the user here. This
 * screen never touches `USER_NAME` or any plant data — it exists purely so a
 * shared/borrowed device doesn't sit open on someone's plant data, while
 * making it trivial for the rightful user to get back in.
 *
 * Behaviour:
 *  - If a display name was previously captured (during onboarding, or edited
 *    here), shows a big primary "Login as <name>" button that immediately
 *    re-activates the session and returns to the Virtual Jungle. A small
 *    "Not <name>?" link reveals an inline name field to correct it without
 *    losing any data.
 *  - If no name is stored yet (e.g. it was left blank during onboarding),
 *    shows the name field directly with a "Continue" button instead.
 *  - Visual language mirrors onboarding's step 4 (gradient icon badge, centred
 *    hero copy) so it reads as part of the same flow rather than a foreign
 *    "auth screen".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { JungleBackground } from '@/components/JungleBackground';
import { Button, Input } from '@/components/ui';
import { SESSION_ACTIVE, USER_NAME } from '@/constants/storageKeys';
import {
    BorderRadius,
    JungleGradientCard,
    SemanticColors,
    Space,
    Typography,
} from '@/constants/theme';

/** Activate the session and return to the Virtual Jungle. A write failure must
 * not strand the user on this screen — the gate defaults to logged-in when
 * the flag is unreadable anyway (see `_layout.tsx`), so navigation proceeds
 * regardless. */
async function activateSession(): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSION_ACTIVE, 'true');
  } catch {
    // Intentionally ignored — see doc comment above.
  }
  router.replace('/');
}

export default function LoginScreen() {
  const [storedName, setStoredName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(USER_NAME)
      .then((value) => {
        if (cancelled) return;
        const trimmed = value?.trim() ?? '';
        setStoredName(trimmed.length > 0 ? trimmed : null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoginAsStoredName = async () => {
    setSubmitting(true);
    await activateSession();
  };

  const handleContinueWithNewName = async () => {
    const trimmed = nameInput.trim();
    setSubmitting(true);
    if (trimmed.length > 0) {
      try {
        await AsyncStorage.setItem(USER_NAME, trimmed);
      } catch {
        // A failed name write must not block logging back in.
      }
    }
    await activateSession();
  };

  // Show the name-entry form directly when there's no stored name, or once
  // the user has tapped "Not <name>?" to correct it.
  const showNameForm = loaded && (storedName === null || editingName);

  return (
    <JungleBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.iconBadge}>
            <LinearGradient
              colors={JungleGradientCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Icon name="plant" size={72} color={SemanticColors.onPrimary} />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.body}>
            Your plants and care history stayed right here on this device while you were
            logged out.
          </Text>

          {!loaded ? null : showNameForm ? (
            <View style={styles.form}>
              <Input
                label="What should we call you?"
                placeholder="Your name"
                value={nameInput}
                onChangeText={setNameInput}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                containerStyle={styles.nameInput}
              />
              <Button
                label="Continue"
                onPress={() => {
                  void handleContinueWithNewName();
                }}
                loading={submitting}
                disabled={submitting}
                style={styles.fullWidthButton}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Button
                label={`Login as ${storedName}`}
                onPress={() => {
                  void handleLoginAsStoredName();
                }}
                loading={submitting}
                disabled={submitting}
                style={styles.fullWidthButton}
              />
              <Text
                accessibilityRole="button"
                accessibilityLabel={`Not ${storedName}? Use a different name`}
                onPress={() => setEditingName(true)}
                style={styles.editNameLink}>
                Not {storedName}?
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </JungleBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xl,
  },
  iconBadge: {
    width: 128,
    height: 128,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...Typography.title,
    color: SemanticColors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...Typography.body,
    color: SemanticColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Space.sm,
  },
  form: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.sm,
  },
  nameInput: {
    alignSelf: 'stretch',
  },
  fullWidthButton: {
    alignSelf: 'stretch',
  },
  editNameLink: {
    ...Typography.bodyBold,
    color: SemanticColors.primary,
  },
});
