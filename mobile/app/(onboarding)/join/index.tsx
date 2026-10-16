import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput as NativeTextInput, StyleSheet, View } from "react-native";
import { useProfile } from "../../../src/features/auth/profile-store";
import {
  ProfileQueuedLine,
  StepFoot,
  StepIntro,
} from "../../../src/features/onboarding/components";
import { useFinishOnboarding } from "../../../src/features/onboarding/finish";
import {
  isCodeProblem,
  JOIN_CODE_LENGTH,
  type JoinFailure,
  joinCodeOf,
} from "../../../src/features/onboarding/invitation";
import { useInvitations } from "../../../src/features/onboarding/use-invitations";
import { useKeyboardVisible } from "../../../src/features/onboarding/use-keyboard-visible";
import {
  announce,
  Button,
  CodeInput,
  Field,
  Note,
  Screen,
  ScreenHeader,
  StepBars,
  Text,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../../src/ui";

/**
 * Onboarding step 2 of 2 (mobile-30): enter the eight-character join code, see the project before
 * joining, or skip and practise in Training. `decamark://join?code=…` opens this step filled in.
 *
 * On device data "Preview project" asks the DECA Mark API what the code opens
 * (`POST /v1/invitations/preview`); preview data resolves only DECA2026. A code that opens nothing, or
 * has expired, is said under the field; a missing connection or a busy server is said beside it, and the
 * code stays in the field for another try.
 *
 * While the keyboard is up, "Preview project" moves into the pinned footer above it, so typing the code
 * never hides the step's one action; the way out returns when the keyboard goes.
 */
export default function JoinStep() {
  const s = useStyles(makeStyles);
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => joinCodeOf(params.code));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<JoinFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<NativeTextInput>(null);
  const invitations = useInvitations();
  const profile = useProfile();
  const finish = useFinishOnboarding();
  const keyboard = useKeyboardVisible();
  const haptics = useHaptics();

  // The identity comes first: a link that lands here before it is saved goes back to step 1.
  if (!profile.saved)
    return <Redirect href={{ pathname: "/profile", params: code ? { code } : {} }} />;

  const complete = code.length === JOIN_CODE_LENGTH;

  function changeCode(next: string) {
    setCode(next);
    setProblem(undefined);
    setNotice(null);
  }

  async function preview() {
    if (busy) return;
    if (!complete) {
      setProblem("Enter all eight characters");
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await invitations.lookup(code);
      if (result.status === "found") {
        router.push({ pathname: "/invitation/[code]", params: { code } });
        return;
      }
      if (result.status === "incomplete") {
        setProblem("Enter all eight characters");
        codeRef.current?.focus();
        return;
      }
      // A deleted account: the gate opens welcome in place of onboarding.
      if (result.failure.kind === "deleted") return;
      haptics.warning();
      announce(result.failure.message);
      if (isCodeProblem(result.failure)) {
        setProblem(result.failure.message);
        codeRef.current?.focus();
      } else {
        setNotice(result.failure);
      }
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (!finish()) router.replace("/profile");
  }

  const previewButton = (
    <Button
      label="Preview project"
      iconRight={busy ? undefined : "arrow-right"}
      fullWidth
      busy={busy}
      busyLabel="Looking up the code…"
      disabled={!complete}
      disabledReason="The button turns on when all eight characters are in."
      onPress={() => void preview()}
      testID="onboarding-preview-project"
    />
  );

  return (
    <Screen
      scroll
      keyboard
      testID="onboarding-join"
      footer={
        keyboard ? (
          previewButton
        ) : (
          <StepFoot
            text="No code yet? Training works without a project."
            action={<TextLink label="Skip for now" onPress={skip} testID="onboarding-skip" />}
          />
        )
      }
    >
      <ScreenHeader
        back={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
        trailing={<StepBars count={2} current={2} />}
        style={s.header}
      />
      <View style={s.body}>
        <StepIntro
          title="Join a project"
          lead="Enter the eight-character code supplied by your coordinator. You will see the project before joining."
        />
        <ProfileQueuedLine />
        <View style={s.join}>
          <Field label="Project join code" hint="Letters and numbers, no spaces." error={problem}>
            <CodeInput
              ref={codeRef}
              kind="join"
              value={code}
              onChangeText={changeCode}
              returnKeyType="go"
              onSubmitEditing={() => void preview()}
              testID="onboarding-join-code"
            />
          </Field>
          {notice ? (
            <Note
              tone="waiting"
              icon={notice.kind === "offline" ? "wifi-off" : "clock"}
              testID="onboarding-join-notice"
            >
              {notice.message}
            </Note>
          ) : null}
          {keyboard ? null : previewButton}
        </View>
        {/* No Scan QR here: the web shows the code and an invitation link, not a QR code (WEB-07). */}
        <Text variant="small" tone="ink2">
          An invitation link from your coordinator opens this step with the code filled in.
        </Text>
      </View>
    </Screen>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    // The title sits where the auth screens put theirs (mobile-24 to 30): 24 under the header.
    header: { marginBottom: t.space.s6 },
    body: { gap: t.space.s6 },
    join: { gap: t.space.s5 },
  });
}
