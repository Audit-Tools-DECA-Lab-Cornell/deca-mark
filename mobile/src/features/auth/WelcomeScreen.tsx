import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Button, Logo, Note, Screen, Text, TextLink, type Theme, useStyles } from "../../ui";
import { PendingInvitationNote } from "../onboarding/pending-invitation-note";
import { AuthPlan } from "./AuthPlan";
import { openPrivacy } from "./links";
import { DELETED_ACCOUNT_TITLE, deletedAccountBody, waitingForTitle, waitingTitle } from "./rules";
import { useDeletedAccount, useSignedOutAccounts, useWaitingRecords } from "./use-waiting-records";

function welcomeStyles(t: Theme) {
  return StyleSheet.create({
    top: { gap: t.space.s5, marginTop: t.space.s2 },
    heading: { gap: t.space.s3, marginTop: t.space.s6 },
    note: { marginTop: t.space.s5 },
    spacer: { flexGrow: 1, minHeight: t.space.s6 },
    actions: { gap: t.space.s3 },
    privacy: { alignSelf: "center" },
  });
}

/**
 * Welcome (Mobile 23): the DECA Mark lockup, the Riverside plan, the promise, and the way in. When
 * records are waiting on this device for a signed-out account, a note names them and their owner before
 * anything else can be chosen: one note for each account that signed out with work left here (MOB-05). When the server reported the account on this device deleted, the gate
 * opens here instead of the app, and the note says its records stay on this device and cannot upload;
 * another account can still sign in.
 */
export function WelcomeScreen() {
  const s = useStyles(welcomeStyles);
  const router = useRouter();
  const waiting = useWaitingRecords();
  const deleted = useDeletedAccount();
  const signedOut = useSignedOutAccounts();

  return (
    <Screen scroll testID="auth-welcome">
      <View style={s.top}>
        <Logo wordmark />
        <AuthPlan />
      </View>
      <View style={s.heading}>
        {/* Broken as drawn (Mobile 23): the promise reads in two beats on every phone width. */}
        <Text variant="display" header accessibilityLabel="Fieldwork starts here.">
          {"Fieldwork\nstarts here."}
        </Text>
        <Text variant="body" tone="ink2">
          Capture observations in place. Your records stay with you, even when the network does not.
        </Text>
      </View>
      {deleted ? (
        <Note
          tone="attention"
          title={DELETED_ACCOUNT_TITLE}
          style={s.note}
          testID="auth-welcome-deleted"
        >
          {deletedAccountBody(deleted.count)}
        </Note>
      ) : waiting ? (
        <Note tone="waiting" icon="smartphone" title={waitingTitle(waiting.count)} style={s.note}>
          {`They belong to ${waiting.owner}. Sign in to that account to resume uploads.`}
        </Note>
      ) : null}
      {signedOut.map((summary) => (
        <Note
          key={summary.userId}
          tone="waiting"
          icon="smartphone"
          title={waitingForTitle(
            summary.unsent,
            summary.drafts,
            summary.email ?? "an account that signed out",
          )}
          style={s.note}
          testID={`auth-welcome-waiting-${summary.userId}`}
        >
          They wait here for that account. Only that account can upload them.
        </Note>
      ))}
      <PendingInvitationNote style={s.note} />
      <View style={s.spacer} />
      <View style={s.actions}>
        <Button
          label="Sign in"
          iconRight="arrow-right"
          fullWidth
          onPress={() => router.push("/sign-in")}
          testID="auth-welcome-sign-in"
        />
        <Button
          label="Create account"
          variant="outline"
          fullWidth
          onPress={() => router.push("/create-account")}
          testID="auth-welcome-create"
        />
        <TextLink
          label="Privacy information"
          tone="ink"
          onPress={openPrivacy}
          accessibilityHint="Opens in the browser."
          style={s.privacy}
        />
      </View>
    </Screen>
  );
}
