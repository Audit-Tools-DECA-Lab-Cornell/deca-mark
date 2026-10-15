import { router } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput as NativeTextInput, StyleSheet, View } from "react-native";
import { useAccount } from "../../../../src/auth/provider";
import { useMe } from "../../../../src/data/api/me-provider";
import { useProfile } from "../../../../src/features/auth/profile-store";
import { type SendOutcome, useProfileSync } from "../../../../src/features/auth/profile-sync";
import { ProfileQueuedLine, RecordedAs } from "../../../../src/features/onboarding/components";
import {
  INITIALS_MAX,
  initialsProblem,
  NAME_MAX,
  nameProblem,
  profileDefaults,
  typedInitials,
} from "../../../../src/features/onboarding/identity";
import { PageIntro } from "../../../../src/features/projects/parts";
import {
  announce,
  Button,
  Field,
  Screen,
  ScreenHeader,
  TextInput,
  type Theme,
  useHaptics,
  useStyles,
} from "../../../../src/ui";

function profileStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    fields: { gap: t.space.s4 },
  });
}

/**
 * Edit profile (MOB-07): the full name and the observer initials, the code on every new observation.
 * Saved on this device first, then sent with `PATCH /v1/me`; offline, the edit waits here and is sent on
 * the next resume, as in onboarding. A changed code applies to new observations only.
 */
export default function EditProfileScreen() {
  const s = useStyles(profileStyles);
  const profile = useProfile();
  const me = useMe();
  const sync = useProfileSync();
  const haptics = useHaptics();
  const { session } = useAccount();
  const [start] = useState(() =>
    profileDefaults({
      local: profile.saved
        ? { name: profile.name, initials: profile.initials, pending: profile.pending }
        : null,
      server: me.profile,
      accountName: "",
    }),
  );
  const [name, setName] = useState(start.name);
  const [initials, setInitials] = useState(start.initials);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<NativeTextInput>(null);
  const initialsRef = useRef<NativeTextInput>(null);
  const nameError = nameProblem(name);
  const initialsError = initialsProblem(initials);
  const valid = nameError === undefined && initialsError === undefined;

  async function save() {
    if (saving) return;
    if (!valid) {
      setAttempted(true);
      (nameError ? nameRef : initialsRef).current?.focus();
      return;
    }
    if (!profile.set(name, initials)) return;
    setSaving(true);
    let outcome: SendOutcome;
    try {
      outcome = session ? await sync.flush() : "queued";
    } catch {
      outcome = "queued";
    } finally {
      setSaving(false);
    }
    // A deleted account: the gate opens welcome.
    if (outcome === "deleted") return;
    haptics.success();
    announce(
      outcome === "sent"
        ? "Profile saved."
        : "Profile saved on this device. It is sent when DECA Mark can be reached.",
    );
    if (router.canGoBack()) router.back();
  }

  return (
    <Screen
      scroll
      keyboard
      dock
      testID="account-profile"
      footer={
        <Button
          label="Save profile"
          icon="check"
          fullWidth
          busy={saving}
          busyLabel="Saving your profile…"
          disabled={!valid}
          disabledReason="The button turns on when your name and initials are filled in."
          onPress={() => void save()}
          testID="account-profile-save"
        />
      }
    >
      <ScreenHeader back />
      <View style={s.body}>
        <PageIntro
          title="Your observer identity"
          lead="Your initials are recorded with every new observation. Observations already saved keep their code."
        />
        <View style={s.fields}>
          <Field label="Full name" error={attempted ? nameError : undefined}>
            <TextInput
              ref={nameRef}
              value={name}
              onChangeText={setName}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => initialsRef.current?.focus()}
              testID="account-profile-name"
            />
          </Field>
          <Field
            label="Observer initials"
            hint="Up to 10 uppercase characters."
            error={attempted ? initialsError : undefined}
          >
            <TextInput
              ref={initialsRef}
              value={initials}
              onChangeText={(value) => setInitials(typedInitials(value))}
              maxLength={INITIALS_MAX}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              returnKeyType="go"
              onSubmitEditing={() => void save()}
              testID="account-profile-initials"
            />
          </Field>
          <RecordedAs initials={initials} />
          <ProfileQueuedLine />
        </View>
      </View>
    </Screen>
  );
}
