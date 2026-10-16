import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Keyboard, type TextInput as NativeTextInput, StyleSheet, View } from "react-native";
import { useAccount } from "../../auth/provider";
import {
  announce,
  Button,
  Checkbox,
  Field,
  FieldFooter,
  Note,
  Text,
  TextInput,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../ui";
import { PendingInvitationNote } from "../onboarding/pending-invitation-note";
import { createAccount } from "./auth-calls";
import { openPrivacy } from "./links";
import { AuthScreen, EMAIL_INPUT, FieldStack, firstParam, PasswordFields } from "./parts";
import { AUTH_MESSAGES, type AuthFailure, DOES_NOT_MATCH, isEmail, passwordProblem } from "./rules";

type Errors = {
  email?: string | undefined;
  password?: string | undefined;
  confirm?: string | undefined;
  privacy?: string | undefined;
};

/** The privacy link lines up with the checkbox label: the 24 px box and the 12 px gap beside it. */
function createStyles(t: Theme) {
  return StyleSheet.create({
    privacy: { gap: t.space.s1 },
    privacyMore: { paddingLeft: t.space.s6 + t.space.s3, gap: t.space.s1 },
    signIn: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
      columnGap: t.space.s2,
    },
    centre: { alignSelf: "center" },
  });
}

/**
 * Create your account (Mobile 25). The checks run as you type; the button stays live and, when pressed,
 * names every field that still needs something and moves to the first. Then Supabase's `signUp` sends
 * the six-digit code (MOB-05) and the code screen opens. Supabase answers the same way for an address
 * that already has an account, so nothing here says whether one exists.
 */
export function CreateAccountScreen() {
  const s = useStyles(createStyles);
  const router = useRouter();
  const haptics = useHaptics();
  const { client } = useAccount();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const [email, setEmail] = useState(() => firstParam(params.email) ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<NativeTextInput>(null);
  const passwordRef = useRef<NativeTextInput>(null);
  const confirmRef = useRef<NativeTextInput>(null);

  async function submit() {
    if (busy) return;
    const found: Errors = {
      email: isEmail(email) ? undefined : "Enter an email address, such as name@example.org.",
      password: passwordProblem(password),
      confirm:
        confirm.length === 0
          ? "Enter the same password again."
          : confirm !== password
            ? DOES_NOT_MATCH
            : undefined,
      privacy: privacy ? undefined : "Confirm that you have read the privacy information.",
    };
    setErrors(found);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    if (found.confirm) return confirmRef.current?.focus();
    if (found.privacy) {
      Keyboard.dismiss();
      announce(found.privacy);
      return;
    }
    setFailure(null);
    setBusy(true);
    const outcome = await createAccount(client?.auth, email, password);
    setBusy(false);
    if (outcome.ok) {
      setPassword("");
      setConfirm("");
      router.push({ pathname: "/verify", params: { email: email.trim(), sent: "1" } });
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
      title="Create your account"
      lead="Your account can join multiple research projects."
      testID="auth-create"
      action={
        <Button
          label="Send verification code"
          busyLabel="Sending code…"
          busy={busy}
          icon="mail"
          fullWidth
          onPress={() => void submit()}
          testID="auth-create-submit"
        />
      }
      after={
        <View style={s.signIn}>
          <Text variant="body">Already have an account?</Text>
          <TextLink
            label="Sign in"
            onPress={() =>
              router.dismissTo({ pathname: "/sign-in", params: { email: email.trim() } })
            }
            style={s.centre}
          />
        </View>
      }
    >
      <PendingInvitationNote />
      {message ? (
        // Announced when it appears (see submit), so a repeat of the same failure is heard again.
        <Note
          tone="attention"
          title={message.title}
          action={
            failure === "exists" ? (
              <Button
                variant="ink"
                label="Sign in"
                onPress={() =>
                  router.dismissTo({ pathname: "/sign-in", params: { email: email.trim() } })
                }
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
            onChangeText={(value) => {
              setEmail(value);
              setErrors((current) => ({ ...current, email: undefined }));
            }}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="auth-create-email"
          />
        </Field>
        <PasswordFields
          passwordLabel="Password"
          confirmLabel="Confirm password"
          rule="Use at least 8."
          password={password}
          confirm={confirm}
          onPasswordChange={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined, confirm: undefined }));
          }}
          onConfirmChange={(value) => {
            setConfirm(value);
            setErrors((current) => ({ ...current, confirm: undefined }));
          }}
          passwordError={errors.password}
          confirmError={errors.confirm}
          passwordRef={passwordRef}
          confirmRef={confirmRef}
          onSubmit={() => void submit()}
          testID="auth-create"
        />
      </FieldStack>
      <View style={s.privacy}>
        <Checkbox
          label="I have read the privacy information for this research platform."
          checked={privacy}
          onCheckedChange={(checked) => {
            setPrivacy(checked);
            setErrors((current) => ({ ...current, privacy: undefined }));
          }}
          testID="auth-create-privacy"
        />
        <View style={s.privacyMore}>
          {errors.privacy ? <FieldFooter error={errors.privacy} /> : null}
          <TextLink
            label="Read the privacy information"
            arrow="right"
            onPress={openPrivacy}
            accessibilityHint="Opens in the browser."
          />
        </View>
      </View>
    </AuthScreen>
  );
}
