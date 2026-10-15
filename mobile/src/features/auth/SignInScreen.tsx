import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, type TextInput as NativeTextInput, StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/provider";
import {
  announce,
  Button,
  Field,
  Note,
  PasswordInput,
  StatusLine,
  Text,
  TextInput,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../ui";
import { PendingInvitationNote } from "../onboarding/pending-invitation-note";
import { resendSignUpCode } from "./auth-calls";
import { useGate } from "./gate";
import { openPrivacy } from "./links";
import { type AuthNotice, takeAuthNotice } from "./notice";
import { AuthScreen, EMAIL_INPUT, FieldStack, firstParam } from "./parts";
import {
  DELETED_ACCOUNT_TITLE,
  deletedAccountBody,
  isEmail,
  SIGN_IN_MESSAGES,
  type SignInFailure,
  signInFailure,
  waitingTitle,
} from "./rules";
import { useDeletedAccount, useWaitingRecords } from "./use-waiting-records";

type Errors = { email?: string | undefined; password?: string | undefined };

function signInStyles(t: Theme) {
  return StyleSheet.create({
    links: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      columnGap: t.space.s6,
    },
    help: { alignItems: "center", gap: t.space.s1 },
    centre: { alignSelf: "center" },
  });
}

/**
 * Sign in (Mobile 24): Supabase's `signInWithPassword`, through the client the AuthProvider already
 * holds. Each way it can fail has its own words, and every one of them leaves the records waiting here
 * in place. An address that was never verified gets "Send a new code", which opens the code screen
 * (MOB-05). An account the server reported deleted is not let back in on this device: signing in to it
 * says so.
 */
export function SignInScreen() {
  const s = useStyles(signInStyles);
  const router = useRouter();
  const haptics = useHaptics();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const { client, deletedUserId } = useAccount();
  const gate = useGate();
  const waiting = useWaitingRecords();
  const deleted = useDeletedAccount();

  const [email, setEmail] = useState(() => firstParam(params.email) ?? waiting?.email ?? "");
  const emailTouched = useRef(email !== "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const emailRef = useRef<NativeTextInput>(null);
  const passwordRef = useRef<NativeTextInput>(null);

  // The owner of the waiting records is the likely account: fill it in once the queue has been read,
  // unless something has been typed already.
  const owner = waiting?.email;
  useEffect(() => {
    if (owner && !emailTouched.current) setEmail((current) => current || owner);
  }, [owner]);

  // A message left by the screen that sent us here ("Password changed …"), read once on arrival.
  useFocusEffect(
    useCallback(() => {
      const left = takeAuthNotice();
      if (!left) return;
      setNotice(left);
      if (left.email) {
        emailTouched.current = true;
        setEmail(left.email);
      }
      setFailure(null);
      setPassword("");
      announce(left.message);
    }, []),
  );

  async function submit() {
    if (busy) return;
    const found: Errors = {
      email: isEmail(email) ? undefined : "Enter the email address you signed up with.",
      password: password.length > 0 ? undefined : "Enter your password.",
    };
    setErrors(found);
    setNotice(null);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    setFailure(null);
    setBusy(true);
    let outcome: SignInFailure | null;
    try {
      // Without a client the auth module did not start (a build missing its native modules).
      if (!client) throw new Error("Sign-in could not start");
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      // The provider ignores a session for the account the server deleted: say why nothing opens, and
      // drop the session it would otherwise keep in secure storage.
      const deletedAgain = !error && data.user?.id !== undefined && data.user.id === deletedUserId;
      if (deletedAgain) await client.auth.signOut({ scope: "local" });
      outcome = error ? signInFailure(error) : deletedAgain ? "deleted" : null;
    } catch (cause) {
      outcome = signInFailure(cause);
    }
    setBusy(false);
    if (outcome === null) {
      haptics.success();
      setPassword("");
      // The gate opens onboarding or the app as the session arrives; this screen does not navigate.
      // A review override that holds sign-in open says so, rather than leaving the press unanswered.
      if (gate.overridden && gate.route === "auth") {
        const held: AuthNotice = {
          tone: "saved",
          message: "Signed in. The review gate keeps this screen open; set it to Real to go on.",
        };
        setNotice(held);
        announce(held.message);
      }
      return;
    }
    haptics.warning();
    setFailure(outcome);
    const words = SIGN_IN_MESSAGES[outcome];
    announce(`${words.title} ${words.body}`);
    if (outcome === "credentials") {
      setPassword("");
      passwordRef.current?.focus();
    } else {
      Keyboard.dismiss();
    }
  }

  /** An unverified address: a new code, then the code screen. Asking too soon still goes on. */
  async function sendNewCode() {
    if (sending) return;
    setSending(true);
    const outcome = await resendSignUpCode(client?.auth, email);
    setSending(false);
    if (!outcome.ok && outcome.failure !== "rateLimited") {
      const next = outcome.failure === "network" ? "network" : "server";
      setFailure(next);
      const words = SIGN_IN_MESSAGES[next];
      announce(`${words.title} ${words.body}`);
      return;
    }
    setFailure(null);
    setPassword("");
    router.push({ pathname: "/verify", params: { email: email.trim(), sent: "1" } });
  }

  const message = failure ? SIGN_IN_MESSAGES[failure] : null;
  const editEmail = (value: string) => {
    emailTouched.current = true;
    setEmail(value);
    setErrors((current) => ({ ...current, email: undefined }));
  };
  const editPassword = (value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
  };

  return (
    <AuthScreen
      title="Welcome back"
      lead="Sign in to your research workspace."
      testID="auth-sign-in"
      action={
        <Button
          label="Sign in"
          busyLabel="Signing in…"
          busy={busy}
          iconRight={busy ? undefined : "arrow-right"}
          fullWidth
          onPress={() => void submit()}
          testID="auth-sign-in-submit"
        />
      }
      after={
        <View style={s.links}>
          <TextLink
            label="Forgot password?"
            onPress={() =>
              router.push({ pathname: "/forgot-password", params: { email: email.trim() } })
            }
          />
          <TextLink
            label="Create account"
            onPress={() =>
              router.push({ pathname: "/create-account", params: { email: email.trim() } })
            }
          />
        </View>
      }
      bottom={
        <View style={s.help}>
          <Text variant="small" tone="ink2" align="center">
            Trouble signing in? Ask your project coordinator.
          </Text>
          <TextLink
            label="Privacy information"
            tone="ink"
            onPress={openPrivacy}
            accessibilityHint="Opens in the browser."
            style={s.centre}
          />
        </View>
      }
    >
      {notice ? (
        <StatusLine
          tone={notice.tone}
          icon={notice.tone === "saved" ? "check" : "info"}
          text={notice.message}
        />
      ) : null}
      {deleted && failure !== "deleted" ? (
        <Note tone="attention" title={DELETED_ACCOUNT_TITLE}>
          {deletedAccountBody(deleted.count)}
        </Note>
      ) : waiting ? (
        <Note tone="waiting" icon="smartphone" title={waitingTitle(waiting.count)}>
          {`They belong to ${waiting.owner} and upload only from that account.`}
        </Note>
      ) : null}
      <PendingInvitationNote />
      {message ? (
        // Announced when it appears (see submit), so a repeat of the same failure is heard again.
        <Note
          tone="attention"
          title={message.title}
          action={
            failure === "unconfirmed" ? (
              <Button
                variant="ink"
                label="Send a new code"
                busyLabel="Sending code…"
                busy={sending}
                icon="mail"
                onPress={() => void sendNewCode()}
                accessibilityHint="Sends a new six-digit code to this email, then opens the code screen."
                testID="auth-sign-in-resend"
              />
            ) : undefined
          }
        >
          {message.body}
        </Note>
      ) : null}
      <FieldStack>
        <Field label="Email address" error={errors.email}>
          <TextInput
            ref={emailRef}
            {...EMAIL_INPUT}
            value={email}
            onChangeText={editEmail}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="auth-sign-in-email"
          />
        </Field>
        <Field label="Password" error={errors.password}>
          <PasswordInput
            ref={passwordRef}
            value={password}
            onChangeText={editPassword}
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            testID="auth-sign-in-password"
          />
        </Field>
      </FieldStack>
    </AuthScreen>
  );
}
