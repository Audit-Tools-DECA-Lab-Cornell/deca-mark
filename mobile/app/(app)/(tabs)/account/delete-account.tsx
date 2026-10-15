import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, StyleSheet, View } from "react-native";
import { useAccount } from "../../../../src/auth/provider";
import { createApiClient } from "../../../../src/data/api/client";
import { useMe } from "../../../../src/data/api/me-provider";
import {
  type DeletionOutcome,
  finishingLine,
  runAccountDeletion,
} from "../../../../src/features/account/deletion";
import { deletionConsequences } from "../../../../src/features/account/leaving";
import { useLocalWork } from "../../../../src/features/account/use-local-work";
import { useProfile } from "../../../../src/features/auth/profile-store";
import { PageIntro } from "../../../../src/features/projects/parts";
import { connection } from "../../../../src/platform/config";
import {
  announce,
  Button,
  Field,
  Island,
  Note,
  Screen,
  ScreenHeader,
  Text,
  TextInput,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
} from "../../../../src/ui";

const CONFIRM_WORD = "DELETE";

function deleteStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    lines: { gap: t.space.s3 },
    centre: { alignSelf: "center" },
  });
}

/**
 * What the screen says after a try: why nothing was deleted, or that a deletion was recorded while another
 * account signed in here. Null when the device moves on to welcome by itself.
 */
function refusal(outcome: DeletionOutcome): { title: string; body: string } | null {
  switch (outcome.kind) {
    case "recorded":
      if (outcome.stopped !== "otherAccount") return null;
      return {
        title: "Deletion is recorded.",
        body: "A different account is signed in on this phone now, so DECA Mark stopped trying. Removing the deleted account's sign-in is recorded, and the person who runs DECA Mark will complete it. The account signed in now was not touched.",
      };
    case "unavailable":
      return {
        title: "Deleting accounts is not available yet. Nothing was deleted.",
        body: "DECA Mark cannot complete a deletion on this server yet. To ask for it, see decamark.vercel.app/privacy/delete-data.",
      };
    case "soleOwner":
      return {
        title: "Nothing was deleted.",
        body: "You are the only owner of an organization. Hand it to another owner on the web (the organization's Settings), then try again.",
      };
    case "otherAccount":
      return {
        title: "Nothing was deleted.",
        body: "A different account is signed in on this phone now. Open Account again to see which.",
      };
    case "failed":
      if (outcome.error.kind === "sign-in")
        return {
          title: "Nothing was deleted.",
          body: "Sign in to this account again, then try. Your records stay on this device.",
        };
      if (outcome.error.code === "unknown")
        return {
          title: "Nothing was deleted.",
          body: "We could not reach DECA Mark. Try again when you have signal.",
        };
      return { title: "Nothing was deleted.", body: outcome.error.message };
    default:
      return null;
  }
}

/**
 * Delete account (MOB-07 step 3): every consequence first, then DELETE typed to confirm, then
 * `DELETE /v1/me` for the account that confirmed, and only while it is the one signed in here (the web's
 * rule since PR 26). A 202 is tried again for about 30 seconds and then counts as recorded. Once deleted
 * or recorded, this device treats the account as deleted: its records stay here and can never upload,
 * and welcome says so. Removing them from the device is the data layer's routine, not built yet.
 */
export default function DeleteAccountScreen() {
  const s = useStyles(deleteStyles);
  const haptics = useHaptics();
  const { client, account, session, markAccountDeleted } = useAccount();
  const me = useMe();
  const profile = useProfile();
  const work = useLocalWork();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DeletionOutcome | null>(null);
  // The live session, read by every try: a sign-in that changes mid-retry stops them.
  const live = useRef(session);
  live.current = session;
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const confirmedFor = account?.id ?? null;
  const api = useMemo(() => {
    if (!client || !confirmedFor) return null;
    return createApiClient(connection.apiUrl, async () => {
      const { data } = await client.auth.getSession();
      return data.session?.user.id === confirmedFor ? data.session.access_token : null;
    });
  }, [client, confirmedFor]);

  const projects = me.projects.length;
  const code = (profile.saved ? profile.initials : me.profile?.observer_initials) || null;
  const consequences = deletionConsequences(work, projects, code);
  const ready = typed.trim() === CONFIRM_WORD;
  const said = outcome ? refusal(outcome) : null;

  async function run() {
    if (!api || !confirmedFor || busy) return;
    setBusy(true);
    setOutcome(null);
    Keyboard.dismiss();
    const result = await runAccountDeletion({
      confirmedFor,
      signedInAs: () => live.current?.user.id ?? null,
      send: () => api.deleteMe(new AbortController().signal),
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      onPending: (next) => {
        const line = finishingLine(next);
        if (mounted.current) setFinishing(line);
        announce(`Deletion is finishing. ${line}`);
      },
    });
    if (result.kind === "deleted" || result.kind === "recorded") {
      haptics.success();
      // Only the account that confirmed is treated as deleted here; another sign-in is left alone.
      const otherSignedIn = result.kind === "recorded" && result.stopped === "otherAccount";
      const words = refusal(result);
      announce(
        words
          ? `${words.title} ${words.body}`
          : result.kind === "deleted"
            ? "Account deleted. Its records stay on this device and cannot upload."
            : "Account deletion recorded. DECA Mark completes it. Its records stay on this device and cannot upload.",
      );
      if (!otherSignedIn) markAccountDeleted();
      if (mounted.current) {
        setBusy(false);
        setFinishing(null);
        setOutcome(result);
      }
      return;
    }
    if (!mounted.current) return;
    setBusy(false);
    setFinishing(null);
    setOutcome(result);
    haptics.warning();
    const words = refusal(result);
    if (words) announce(`${words.title} ${words.body}`);
  }

  function confirm() {
    if (!ready || busy) return;
    if (work.unsent === 0 && work.drafts === 0) {
      void run();
      return;
    }
    const left = work.unsent + work.drafts;
    Alert.alert(
      left === 1
        ? "Delete with 1 record not uploaded?"
        : `Delete with ${left} records not uploaded?`,
      "This version cannot upload them first. They stay on this device and can never upload.",
      [
        { text: "Keep my account", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: () => void run() },
      ],
    );
  }

  return (
    <Screen
      scroll
      keyboard
      dock
      testID="account-delete-screen"
      footer={
        <Button
          variant="danger-solid"
          label="Delete account"
          busy={busy}
          busyLabel="Deleting account…"
          fullWidth
          disabled={!ready || !api}
          disabledReason={
            !api
              ? "Sign in to this account again to delete it."
              : `The button turns on when ${CONFIRM_WORD} is typed.`
          }
          onPress={confirm}
          testID="account-delete-confirm"
        />
      }
    >
      <ScreenHeader back />
      <View style={s.body}>
        <PageIntro
          title="Delete your account?"
          lead={`${account?.email ?? "This account"}. This cannot be undone.`}
        />
        <Island title="What deleting does" testID="account-delete-consequences">
          <View style={s.lines} accessibilityRole="list">
            {consequences.map((line) => (
              <Text key={line} variant="body">
                {line}
              </Text>
            ))}
          </View>
        </Island>
        {finishing && busy ? (
          <Note tone="waiting" title="Deletion is finishing." live="polite">
            {`Your profile and memberships are removed. ${finishing}`}
          </Note>
        ) : null}
        {said ? (
          <Note tone="attention" title={said.title} testID="account-delete-refused">
            {said.body}
          </Note>
        ) : null}
        <Field label={`Type ${CONFIRM_WORD} to confirm`}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            returnKeyType="go"
            onSubmitEditing={confirm}
            testID="account-delete-typed"
          />
        </Field>
        <TextLink
          label="Keep my account"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate("/account"))}
          style={s.centre}
        />
      </View>
    </Screen>
  );
}
