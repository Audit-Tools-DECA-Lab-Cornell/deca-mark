import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, type TextInput as NativeTextInput } from "react-native";
import { useAccount } from "../../auth/provider";
import {
  announce,
  Button,
  CodeInput,
  Field,
  Mono,
  Note,
  StatusLine,
  Text,
  useHaptics,
} from "../../ui";
import { sendRecoveryCode, setNewPassword, verifyRecoveryCode } from "./auth-calls";
import { holdGate } from "./gate-hold";
import { AuthScreen, FieldStack, Footnote, firstParam, PasswordFields } from "./parts";
import {
  AUTH_MESSAGES,
  type AuthFailure,
  CODE_LENGTH,
  CODE_REFUSED,
  formatCountdown,
  PASSWORD_CHANGED,
  passwordLengthOk,
  RESEND_SECONDS,
  resetDisabledReason,
} from "./rules";
import { useCooldown } from "./use-cooldown";

/**
 * Choose a new password (Mobile 28). "Save new password" stays off, with its reason under it, until the
 * code is in and both passwords match. Then, as on the web (MOB-05): `verifyOtp({type: "recovery"})`
 * proves the code and signs the account in, and `updateUser({password})` saves the new password.
 *
 * The recovery code opens a session before the password is saved, so the screen holds the gate
 * (gate-hold) from the code until the person presses Continue on "Password changed"; otherwise the gate
 * would close sign-in and take this screen away first. A password refused after the code was accepted
 * (the same as the current one) is fixed here without a new code. Leaving lets the gate go: the code
 * already signed the account in, as it does on the web.
 */
export function ResetPasswordScreen() {
  const router = useRouter();
  const haptics = useHaptics();
  const { client } = useAccount();
  const params = useLocalSearchParams<{ email?: string | string[]; sent?: string | string[] }>();
  const email = firstParam(params.email)?.trim() || undefined;
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [done, setDone] = useState(false);
  /** The code this screen already proved, so a refused password does not need another. */
  const verified = useRef<string | null>(null);
  const release = useRef<(() => void) | null>(null);
  const codeRef = useRef<NativeTextInput>(null);
  const passwordRef = useRef<NativeTextInput>(null);
  const confirmRef = useRef<NativeTextInput>(null);
  const cooldown = useCooldown(RESEND_SECONDS, firstParam(params.sent) === "1");
  const reason = resetDisabledReason(code, password, confirm);

  const letGo = useCallback(() => {
    release.current?.();
    release.current = null;
  }, []);
  // Leaving the screen, however it happens, never leaves the gate held.
  useEffect(() => letGo, [letGo]);

  function say(next: AuthFailure) {
    setFailure(next);
    const words = AUTH_MESSAGES[next];
    announce(`${words.title} ${words.body}`);
  }

  async function submit() {
    if (busy || !email) return;
    if (reason) {
      // From the keyboard's return key: go to what is still missing, and say why nothing happened.
      if (code.length < CODE_LENGTH) codeRef.current?.focus();
      else if (!passwordLengthOk(password.length)) passwordRef.current?.focus();
      else confirmRef.current?.focus();
      announce(reason);
      return;
    }
    setFailure(null);
    setCodeError(undefined);
    setPasswordError(undefined);
    setBusy(true);
    Keyboard.dismiss();
    if (verified.current !== code) {
      if (!release.current) release.current = holdGate();
      const checked = await verifyRecoveryCode(client?.auth, email, code);
      if (!checked.ok) {
        letGo();
        setBusy(false);
        haptics.warning();
        if (checked.failure === "code") {
          setCodeError(CODE_REFUSED);
          announce(CODE_REFUSED);
          requestAnimationFrame(() => {
            codeRef.current?.focus();
            codeRef.current?.setSelection(0, CODE_LENGTH);
          });
        } else say(checked.failure);
        return;
      }
      verified.current = code;
    }
    const saved = await setNewPassword(client?.auth, password);
    setBusy(false);
    if (!saved.ok) {
      haptics.warning();
      if (saved.failure === "samePassword" || saved.failure === "weakPassword") {
        const words = AUTH_MESSAGES[saved.failure];
        setPasswordError(words.body);
        announce(`${words.title} ${words.body}`);
        passwordRef.current?.focus();
        return;
      }
      if (saved.failure === "sessionMissing") {
        // The code's session is gone: a new code is needed, and nothing holds the routes meanwhile.
        verified.current = null;
        letGo();
      }
      say(saved.failure);
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
    haptics.success();
    announce(`${PASSWORD_CHANGED} You are signed in as ${email}.`);
  }

  async function resend() {
    if (!email || resending || cooldown.remaining > 0) return;
    setResending(true);
    const outcome = await sendRecoveryCode(client?.auth, email);
    setResending(false);
    if (!outcome.ok && outcome.failure !== "rateLimited") {
      say(outcome.failure);
      return;
    }
    cooldown.start();
    verified.current = null;
    setCode("");
    setCodeError(undefined);
    setFailure(null);
    codeRef.current?.focus();
    announce(`If ${email} has an account, a new code is on its way. It replaces the old one.`);
  }

  if (!email)
    return (
      <AuthScreen
        title="Choose a new password"
        lead="Start again with your email address, so we know where the code went."
        testID="auth-reset"
        action={
          <Button
            label="Send recovery code"
            iconRight="arrow-right"
            fullWidth
            onPress={() => router.dismissTo("/forgot-password")}
          />
        }
      >
        <Note tone="attention" title="This screen lost the email address.">
          No password was changed. Enter your email address again to get a new code.
        </Note>
      </AuthScreen>
    );

  if (done)
    return (
      <AuthScreen
        title="Password changed"
        lead={
          <>
            You are signed in as{" "}
            <Text variant="bodyStrong" tone="ink">
              {email}
            </Text>
            .
          </>
        }
        testID="auth-reset-done"
        action={
          <Button
            label="Continue"
            iconRight="arrow-right"
            fullWidth
            onPress={letGo}
            testID="auth-reset-continue"
          />
        }
        bottom={
          <Footnote>Changing your password does not touch the records on this device.</Footnote>
        }
      >
        <StatusLine
          tone="saved"
          icon="check"
          text="Password changed. Use the new one from now on."
        />
      </AuthScreen>
    );

  const waitingForCode = cooldown.remaining > 0;
  return (
    <AuthScreen
      title="Choose a new password"
      lead="Verify the recovery code, then set a new password."
      testID="auth-reset"
      action={
        <Button
          label="Save new password"
          busyLabel="Saving new password…"
          busy={busy}
          icon={reason ? "lock" : "check"}
          fullWidth
          disabled={Boolean(reason)}
          disabledReason={reason}
          onPress={() => void submit()}
          testID="auth-reset-submit"
        />
      }
      after={
        <Button
          label={
            waitingForCode
              ? `Send a new code in ${formatCountdown(cooldown.remaining)}`
              : "Send a new code"
          }
          busyLabel="Sending code…"
          busy={resending}
          variant="outline"
          icon="rotate-cw"
          fullWidth
          disabled={waitingForCode}
          disabledReason={waitingForCode ? "A new code can be sent once a minute." : undefined}
          onPress={() => void resend()}
          testID="auth-reset-resend"
        />
      }
      bottom={
        <Footnote>Changing your password does not touch the records on this device.</Footnote>
      }
    >
      <Text variant="body" tone="ink2">
        The code went to <Mono size="body">{email}</Mono>.
      </Text>
      {failure ? (
        <Note tone="attention" title={AUTH_MESSAGES[failure].title}>
          {AUTH_MESSAGES[failure].body}
        </Note>
      ) : null}
      <FieldStack>
        <Field label="Six-digit recovery code" error={codeError}>
          <CodeInput
            ref={codeRef}
            kind="otp"
            value={code}
            onChangeText={(value) => {
              setCode(value);
              setCodeError(undefined);
            }}
            // The number pad has no return key: a complete code moves on to the new password.
            onComplete={() => passwordRef.current?.focus()}
            testID="auth-reset-code"
          />
        </Field>
        <PasswordFields
          passwordLabel="New password"
          confirmLabel="Confirm new password"
          rule="At least 8."
          password={password}
          confirm={confirm}
          onPasswordChange={(value) => {
            setPassword(value);
            setPasswordError(undefined);
          }}
          onConfirmChange={setConfirm}
          passwordError={passwordError}
          passwordRef={passwordRef}
          confirmRef={confirmRef}
          onSubmit={() => void submit()}
          testID="auth-reset"
        />
      </FieldStack>
    </AuthScreen>
  );
}
