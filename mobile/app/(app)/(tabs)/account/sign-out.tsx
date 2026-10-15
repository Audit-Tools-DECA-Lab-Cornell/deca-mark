import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../../../src/auth/provider";
import { signOutWarning } from "../../../../src/features/account/leaving";
import { useLocalWork } from "../../../../src/features/account/use-local-work";
import { useSignOutHere } from "../../../../src/features/account/use-sign-out";
import { PageIntro } from "../../../../src/features/projects/parts";
import {
  announce,
  Button,
  Note,
  Screen,
  ScreenHeader,
  ScreenState,
  Text,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../../../src/ui";

function signOutStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    lines: { gap: t.space.s2 },
    centre: { alignSelf: "center" },
  });
}

/**
 * Sign out? (MOB-07, PRODUCT.md): before signing out, what waits on this device for this account, by
 * count, and that another account cannot upload it. Signing out works offline (`scope: "local"`), keeps
 * every record and draft here for this account, and writes the note welcome shows (MOB-05). The gate then
 * opens welcome; this screen does not navigate.
 */
export default function SignOutScreen() {
  const s = useStyles(signOutStyles);
  const haptics = useHaptics();
  const { account } = useAccount();
  const work = useLocalWork();
  const signOutHere = useSignOutHere();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const email = account?.email ?? "this account";
  const unread = !work.loading && work.error !== null;
  const warning = work.loading || unread ? null : signOutWarning(work, email);

  async function signOut() {
    if (busy || work.loading) return;
    setBusy(true);
    setFailed(false);
    // Without a count, no note is written for welcome: it would claim a number nobody read.
    const done = await signOutHere(unread ? null : work);
    if (done) {
      haptics.success();
      announce(
        warning ? `Signed out. Your records stay on this device for ${email}.` : "Signed out.",
      );
      return;
    }
    setBusy(false);
    setFailed(true);
    haptics.warning();
    announce("You are still signed in. Signing out did not finish on this device. Try again.");
  }

  return (
    <Screen
      scroll
      dock
      testID="account-sign-out-screen"
      footer={
        <Button
          label={warning || unread ? "Sign out and keep local records" : "Sign out of this device"}
          icon="log-out"
          fullWidth
          busy={busy}
          busyLabel="Signing out…"
          disabled={work.loading}
          disabledReason="The button turns on once the records on this device are counted."
          onPress={() => void signOut()}
          testID="account-sign-out-confirm"
        />
      }
    >
      <ScreenHeader back />
      <View style={s.body}>
        <PageIntro
          title="Sign out?"
          lead={
            warning || unread
              ? undefined
              : `Nothing is waiting on this device for ${email}. Signing out works without a connection.`
          }
        />
        {work.loading ? (
          <ScreenState kind="loading" body="Reading records from this device…" />
        ) : unread ? (
          <Note
            tone="attention"
            title="We could not count what waits on this device."
            action={
              <Button variant="ink" label="Try again" icon="rotate-cw" onPress={work.retry} />
            }
            testID="account-sign-out-unread"
          >
            {`Anything recorded here stays on this device for ${email}. Another account cannot upload it.`}
          </Note>
        ) : warning ? (
          <Note
            tone="waiting"
            icon="smartphone"
            title={warning[0]}
            testID="account-sign-out-warning"
          >
            {warning.slice(1).join(" ")}
          </Note>
        ) : null}
        {failed ? (
          <Note tone="attention" title="You are still signed in.">
            Signing out did not finish on this device. Try again.
          </Note>
        ) : null}
        {warning ? (
          <View style={s.lines}>
            <Text variant="body" tone="ink2">
              Signing in to this account again shows them. This version does not upload yet, so they
              wait here either way.
            </Text>
          </View>
        ) : null}
        <TextLink
          label="Stay signed in"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/account"))}
          style={s.centre}
          testID="account-stay-signed-in"
        />
      </View>
    </Screen>
  );
}
