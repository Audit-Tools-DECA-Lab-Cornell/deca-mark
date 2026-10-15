import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, type TextInput as NativeTextInput, StyleSheet } from "react-native";
import { useAccount } from "../../auth/provider";
import {
  announce,
  Button,
  Field,
  Note,
  TextInput,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../ui";
import { sendRecoveryCode } from "./auth-calls";
import { AuthScreen, EMAIL_INPUT, firstParam } from "./parts";
import { AUTH_MESSAGES, type AuthFailure, isEmail, stayingTitle } from "./rules";
import { useWaitingRecords } from "./use-waiting-records";

function forgotStyles(_t: Theme) {
  return StyleSheet.create({
    centre: { alignSelf: "center" },
  });
}

/**
 * Reset your password (Mobile 27). Supabase's `resetPasswordForEmail` sends a six-digit recovery code
 * (MOB-05) and the next screen takes it. The same thing happens whether or not the address has an
 * account, so the screen cannot be used to look one up. Records waiting on this device are named at the
 * foot: recovering the account neither uploads nor removes them.
 */
export function ForgotPasswordScreen() {
  const s = useStyles(forgotStyles);
  const router = useRouter();
  const haptics = useHaptics();
  const { client } = useAccount();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const waiting = useWaitingRecords();
  const [email, setEmail] = useState(() => firstParam(params.email) || waiting?.email || "");
  const emailTouched = useRef(email !== "");
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<NativeTextInput>(null);

  // The owner of the waiting records is the account most likely being recovered (Mobile 27): fill it in
  // once the queue has been read, unless something has been typed or passed from sign-in.
  const owner = waiting?.email;
  useEffect(() => {
    if (owner && !emailTouched.current) setEmail((current) => current || owner);
  }, [owner]);

  async function submit() {
    if (busy) return;
    if (!isEmail(email)) {
      setError("Enter the email address you signed up with.");
      emailRef.current?.focus();
      return;
    }
    setFailure(null);
    setBusy(true);
    const outcome = await sendRecoveryCode(client?.auth, email);
    setBusy(false);
    if (outcome.ok) {
      router.push({ pathname: "/reset-password", params: { email: email.trim(), sent: "1" } });
      return;
    }
    haptics.warning();
    Keyboard.dismiss();
    setFailure(outcome.failure);
    const words = AUTH_MESSAGES[outcome.failure];
    announce(`${words.title} ${words.body}`);
  }

  const message = failure ? AUTH_MESSAGES[failure] : null;

  return (
    <AuthScreen
      title="Reset your password"
      lead="If an account exists for this email, we will send a recovery code."
      testID="auth-forgot"
      action={
        <Button
          label="Send recovery code"
          busyLabel="Sending code…"
          busy={busy}
          icon="mail"
          fullWidth
          onPress={() => void submit()}
          testID="auth-forgot-submit"
        />
      }
      after={
        <TextLink
          label="Back to sign in"
          arrow="left"
          onPress={() =>
            router.dismissTo({ pathname: "/sign-in", params: { email: email.trim() } })
          }
          style={s.centre}
        />
      }
      bottom={
        waiting ? (
          <Note tone="waiting" icon="smartphone" title={stayingTitle(waiting.count)}>
            while you recover your account. Nothing is uploaded or removed until you sign in again.
          </Note>
        ) : undefined
      }
    >
      {message ? (
        <Note tone="attention" title={message.title}>
          {message.body}
        </Note>
      ) : null}
      <Field label="Email address" error={error}>
        <TextInput
          ref={emailRef}
          {...EMAIL_INPUT}
          textContentType="emailAddress"
          value={email}
          onChangeText={(value) => {
            emailTouched.current = true;
            setEmail(value);
            setError(undefined);
          }}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="auth-forgot-email"
        />
      </Field>
    </AuthScreen>
  );
}
