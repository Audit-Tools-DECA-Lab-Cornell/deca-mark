import { useRouter } from "expo-router";
import { type ReactNode, type Ref, useCallback, useState } from "react";
import { type TextInput as NativeTextInput, StyleSheet, View } from "react-native";
import {
  Field,
  Logo,
  Mono,
  PasswordInput,
  Screen,
  ScreenHeader,
  Text,
  TextInput,
  type TextInputProps,
  type Theme,
  useStyles,
} from "../../ui";
import { useKeyboardVisible } from "../../ui/use-keyboard-visible";
import { confirmCheck, lengthCheck, MAX_PASSWORD_LENGTH } from "./rules";

/** What every email field on these screens asks the keyboard and the password manager for. */
export const EMAIL_INPUT = {
  autoCapitalize: "none",
  autoCorrect: false,
  spellCheck: false,
  keyboardType: "email-address",
  inputMode: "email",
  autoComplete: "email",
  textContentType: "username",
  importantForAutofill: "yes",
} as const satisfies Partial<TextInputProps>;

/** The first value of a route parameter. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Back in the stack, or to the welcome screen when an auth screen was opened by a link. */
export function useAuthBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/welcome");
  }, [router]);
}

function authStyles(t: Theme) {
  return StyleSheet.create({
    heading: { gap: t.space.s2, marginTop: t.space.s2, marginBottom: t.space.s6 },
    form: { gap: t.space.s5 },
    // Fields sit closer to each other than to the notes above them and the action below (Mobile 24–28).
    fields: { gap: t.space.s4 },
    actions: { gap: t.space.s2 },
    spacer: { flexGrow: 1, minHeight: t.space.s6 },
    bottom: { gap: t.space.s4 },
    footnote: {
      borderTopWidth: t.size.border,
      borderTopColor: t.c.line,
      paddingTop: t.space.s4,
    },
    preview: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      columnGap: t.space.s3,
      rowGap: t.space.s1,
    },
  });
}

export type AuthScreenProps = {
  /** The screen title, read as a heading: "Welcome back". */
  title: string;
  /** The line under the title. Text nodes inside it may be bold ("We sent a six-digit code to …"). */
  lead?: ReactNode;
  /** The back circle. Defaults to back in the stack, or the welcome screen. */
  onBack?: (() => void) | undefined;
  /** Notes and fields, top to bottom. */
  children: ReactNode;
  /**
   * The one primary button. It sits under the fields as designed, and rides above the keyboard while
   * the keyboard is up, so the keyboard never hides it.
   */
  action: ReactNode;
  /** What follows the action: links and the second action. */
  after?: ReactNode;
  /** The foot of the screen: a footnote, the waiting note, help and privacy. */
  bottom?: ReactNode;
  testID?: string | undefined;
};

/**
 * The frame of the auth screens after welcome (Mobile 24–28): the back circle and the DECA Mark brand mark,
 * the title and lead, the form, the one primary action, and a foot that stays at the bottom of a tall
 * screen and scrolls on a short one.
 */
export function AuthScreen({
  title,
  lead,
  onBack,
  children,
  action,
  after,
  bottom,
  testID,
}: AuthScreenProps) {
  const s = useStyles(authStyles);
  const back = useAuthBack();
  const keyboardUp = useKeyboardVisible();
  return (
    <Screen scroll keyboard footer={keyboardUp ? action : undefined} testID={testID}>
      <ScreenHeader back={onBack ?? back} trailing={<Logo />} />
      <View style={s.heading}>
        <Text variant="page" header>
          {title}
        </Text>
        {lead ? (
          <Text variant="body" tone="ink2">
            {lead}
          </Text>
        ) : null}
      </View>
      <View style={s.form}>
        {children}
        {keyboardUp && !after ? null : (
          <View style={s.actions}>
            {keyboardUp ? null : action}
            {after ?? null}
          </View>
        )}
      </View>
      <View style={s.spacer} />
      {bottom ? <View style={s.bottom}>{bottom}</View> : null}
    </Screen>
  );
}

/** Consecutive fields, 16 apart; the form keeps 20 between them and a note or the action. */
export function FieldStack({ children }: { children: ReactNode }) {
  const s = useStyles(authStyles);
  return <View style={s.fields}>{children}</View>;
}

/** A footnote at the foot of a screen, under a rule: "Changing your password does not touch …". */
export function Footnote({ children }: { children: string }) {
  const s = useStyles(authStyles);
  return (
    <View style={s.footnote}>
      <Text variant="small" tone="ink2">
        {children}
      </Text>
    </View>
  );
}

/**
 * Says that a screen shows preview data (development and review builds) and what that means there. It
 * keeps the screen honest without changing its design.
 */
export function PreviewLine({ children }: { children: string }) {
  const s = useStyles(authStyles);
  return (
    <View style={s.preview} accessible accessibilityLabel={`Preview. ${children}`}>
      <Mono variant="label" tone="ink2">
        Preview
      </Mono>
      <Text variant="small" tone="ink2">
        {children}
      </Text>
    </View>
  );
}

export type PasswordFieldsProps = {
  passwordLabel: string;
  confirmLabel: string;
  /** The rule beside the live count: "Use at least 8." on create (Mobile 25), "At least 8." on reset (28). */
  rule: string;
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** An error from submitting, which replaces the live check until the field changes. */
  passwordError?: string | undefined;
  confirmError?: string | undefined;
  passwordRef?: Ref<NativeTextInput> | undefined;
  confirmRef?: Ref<NativeTextInput> | undefined;
  /** The keyboard's return key on the confirmation: it submits the form. */
  onSubmit: () => void;
  testID?: string | undefined;
};

/**
 * A new password and its confirmation, with the live checks Contour asks for: the length updates as you
 * type, and "Does not match yet" waits until the confirmation loses focus or is as long as the password.
 * Both fields ask the password manager for a new password, so a suggested one fills both.
 */
export function PasswordFields({
  passwordLabel,
  confirmLabel,
  rule,
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  passwordError,
  confirmError,
  passwordRef,
  confirmRef,
  onSubmit,
  testID,
}: PasswordFieldsProps) {
  const [confirmLeft, setConfirmLeft] = useState(false);
  const length = lengthCheck(password.length, rule);
  const match = confirmCheck(password, confirm, confirmLeft);
  const focusConfirm = () => {
    if (confirmRef && typeof confirmRef === "object") confirmRef.current?.focus();
  };

  return (
    <>
      <Field
        label={passwordLabel}
        error={passwordError}
        success={passwordError ? undefined : length.success}
        hint={length.hint}
      >
        <PasswordInput
          ref={passwordRef}
          newPassword
          value={password}
          maxLength={MAX_PASSWORD_LENGTH}
          onChangeText={onPasswordChange}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={focusConfirm}
          testID={testID ? `${testID}-password` : undefined}
        />
      </Field>
      <Field
        label={confirmLabel}
        error={confirmError ?? match.error}
        success={confirmError ? undefined : match.success}
      >
        <TextInput
          ref={confirmRef}
          value={confirm}
          onChangeText={onConfirmChange}
          onBlur={() => setConfirmLeft(true)}
          maxLength={MAX_PASSWORD_LENGTH}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          testID={testID ? `${testID}-confirm` : undefined}
        />
      </Field>
    </>
  );
}
