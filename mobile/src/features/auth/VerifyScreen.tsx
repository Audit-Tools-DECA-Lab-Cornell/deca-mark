import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput as NativeTextInput, StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/provider";
import {
  announce,
  Button,
  CodeInput,
  Field,
  Mono,
  Note,
  Text,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../ui";
import { resendSignUpCode, verifyEmail } from "./auth-calls";
import { AuthScreen, Footnote, firstParam } from "./parts";
import {
  AUTH_MESSAGES,
  type AuthFailure,
  CODE_LENGTH,
  CODE_REFUSED,
  formatCountdown,
  RESEND_SECONDS,
} from "./rules";
import { useCooldown } from "./use-cooldown";

function verifyStyles(t: Theme) {
  return StyleSheet.create({
    more: { gap: t.space.s2 },
    resend: { marginTop: t.space.s2, gap: t.space.s2 },
    centre: { alignSelf: "center" },
  });
}

/** Selects the whole code once the field has settled, so the next digits typed replace it. */
function reselect(input: NativeTextInput | null) {
  requestAnimationFrame(() => {
    input?.focus();
    input?.setSelection(0, CODE_LENGTH);
  });
}

/**
 * Check your email (Mobile 26). The code checks itself at the sixth digit, typed, pasted or filled from
 * the keyboard's suggestion, with Supabase's `verifyOtp` (MOB-05). A right code signs the new account
 * in, and the gate then opens onboarding by itself; this screen does not navigate. A new code can be
 * asked for once a minute (`resend`); the wait counts down in mono.
 */
export function VerifyScreen() {
  const s = useStyles(verifyStyles);
  const router = useRouter();
  const haptics = useHaptics();
  const { client } = useAccount();
  const params = useLocalSearchParams<{ email?: string | string[]; sent?: string | string[] }>();
  const email = firstParam(params.email)?.trim() || undefined;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [sentAgain, setSentAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<NativeTextInput>(null);
  // A code was sent on the way here (sign-up or a resend from sign-in), so the first resend waits too.
  const cooldown = useCooldown(RESEND_SECONDS, firstParam(params.sent) === "1");
  const waiting = cooldown.remaining > 0;

  async function check(value: string) {
    if (busy) return;
    if (value.length < CODE_LENGTH) {
      setError("Enter all six digits from the email.");
      inputRef.current?.focus();
      return;
    }
    if (!email) return;
    setError(undefined);
    setFailure(null);
    setBusy(true);
    const outcome = await verifyEmail(client?.auth, email, value);
    if (outcome.ok) {
      // Stays busy: the session is here, and the gate moves on to onboarding.
      haptics.success();
      announce("Email verified.");
      return;
    }
    setBusy(false);
    haptics.warning();
    if (outcome.failure === "code") {
      setError(CODE_REFUSED);
      announce(CODE_REFUSED);
      reselect(inputRef.current);
      return;
    }
    setFailure(outcome.failure);
    const words = AUTH_MESSAGES[outcome.failure];
    announce(`${words.title} ${words.body}`);
  }

  async function resend() {
    if (waiting || resending || !email) return;
    setResending(true);
    setFailure(null);
    const outcome = await resendSignUpCode(client?.auth, email);
    setResending(false);
    if (!outcome.ok && outcome.failure !== "rateLimited") {
      setFailure(outcome.failure);
      const words = AUTH_MESSAGES[outcome.failure];
      announce(`${words.title} ${words.body}`);
      return;
    }
    // A refusal for asking too soon means a code is already on its way: wait out the minute either way.
    cooldown.start();
    setCode("");
    setError(undefined);
    setSentAgain(true);
    inputRef.current?.focus();
    announce(
      `If ${email} is waiting for a code, a new one is on its way. It replaces the old one.`,
    );
  }

  const countdown = formatCountdown(cooldown.remaining);
  const message = failure ? AUTH_MESSAGES[failure] : null;

  if (!email)
    return (
      <AuthScreen
        title="Check your email"
        lead="Start again with your email address, so we know where the code went."
        testID="auth-verify"
        action={
          <Button
            label="Create account"
            iconRight="arrow-right"
            fullWidth
            onPress={() => router.dismissTo("/create-account")}
          />
        }
      >
        <Note tone="attention" title="This screen lost the email address.">
          No code was checked. Enter your email address again to get a new code.
        </Note>
      </AuthScreen>
    );

  return (
    <AuthScreen
      title="Check your email"
      lead={
        <>
          We sent a six-digit code to{" "}
          <Text variant="bodyStrong" tone="ink">
            {email}
          </Text>
          .
        </>
      }
      testID="auth-verify"
      action={
        <Button
          label="Verify email"
          busyLabel="Verifying email…"
          busy={busy}
          icon="check"
          fullWidth
          onPress={() => void check(code)}
          testID="auth-verify-submit"
        />
      }
      after={
        <View style={s.more}>
          <View style={s.resend}>
            <Button
              label="Resend code"
              busyLabel="Sending code…"
              busy={resending}
              variant="outline"
              icon="rotate-cw"
              fullWidth
              disabled={waiting}
              accessibilityHint={
                waiting
                  ? `A new code can be sent once a minute. ${cooldown.remaining} seconds left.`
                  : undefined
              }
              onPress={() => void resend()}
              testID="auth-verify-resend"
            />
            {waiting ? (
              // The disabled reason, with the wait in mono. The button's hint carries it for screen readers.
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text variant="body" tone="ink2" align="center">
                  Resend in{" "}
                  <Mono size="body" tone="ink2">
                    {countdown}
                  </Mono>
                </Text>
              </View>
            ) : null}
          </View>
          <TextLink
            label="Change email address"
            onPress={() => router.dismissTo({ pathname: "/create-account", params: { email } })}
            style={s.centre}
          />
        </View>
      }
      bottom={
        <Footnote>
          Nothing arriving? Check the spam folder, then resend. A new code replaces the old one.
        </Footnote>
      }
    >
      {message ? (
        <Note tone="attention" title={message.title}>
          {message.body}
        </Note>
      ) : sentAgain ? (
        <Note tone="neutral" title="A new code is on its way.">
          It replaces the old one. Enter the code from the latest email.
        </Note>
      ) : null}
      <Field label="Verification code" hint="Paste all six digits." error={error}>
        <CodeInput
          ref={inputRef}
          kind="otp"
          value={code}
          onChangeText={(value) => {
            setCode(value);
            setError(undefined);
          }}
          onComplete={(value) => void check(value)}
          autoFocus
          testID="auth-verify-code"
        />
      </Field>
    </AuthScreen>
  );
}
