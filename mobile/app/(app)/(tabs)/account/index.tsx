import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../../../src/auth/provider";
import { useMe } from "../../../../src/data/api/me-provider";
import { useLocalWork } from "../../../../src/features/account/use-local-work";
import { useProfile } from "../../../../src/features/auth/profile-store";
import { ResumeUploadsNote } from "../../../../src/features/auth/ResumeUploadsNote";
import { ProfileQueuedLine } from "../../../../src/features/onboarding/components";
import { AccountMark, PageIntro } from "../../../../src/features/projects/parts";
import { useOrientationChoice } from "../../../../src/layout/orientation";
import { ORIENTATION_CHOICES, orientationLabels } from "../../../../src/layout/orientation-policy";
import {
  Button,
  FactsList,
  Island,
  ListRow,
  Note,
  RadioRows,
  Screen,
  ScreenHeader,
  StateBadge,
  Text,
  type Theme,
  useStyles,
} from "../../../../src/ui";

function accountStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    actions: { gap: t.space.s3 },
    line: { paddingHorizontal: t.space.s1 },
  });
}

/**
 * Account (MOB-07): who is signed in and their observer code, what this account has on this device,
 * the screen orientation, the field guide, and the two ways to leave: sign out (records wait here for
 * this account) and delete the account. Records upload by themselves while the app is open and online
 * (MOB-29); practice records never do, and the screen says so (MOB-37).
 */
export default function AccountScreen() {
  const s = useStyles(accountStyles);
  const { account, session } = useAccount();
  const me = useMe();
  const profile = useProfile();
  const work = useLocalWork();
  const [orientation, chooseOrientation] = useOrientationChoice();
  const [orientationProblem, setOrientationProblem] = useState<string | null>(null);

  const email = account?.email ?? session?.user.email ?? "this account";
  const name = (profile.saved ? profile.name : me.profile?.display_name) || "Not set";
  const initials = (profile.saved ? profile.initials : me.profile?.observer_initials) || null;

  return (
    <Screen scroll dock testID="account-home">
      <ScreenHeader showOnline avatar={<AccountMark />} />
      <View style={s.body}>
        <PageIntro title="Account" lead={email} />
        <ResumeUploadsNote />

        <Island
          title="Profile"
          footer={
            <Button
              variant="outline"
              label="Edit profile"
              onPress={() => router.push("/account/profile")}
              testID="account-edit-profile"
            />
          }
        >
          <FactsList
            items={[
              { label: "Name", value: name },
              { label: "Observer code", value: initials ?? "Not set", mono: initials !== null },
              { label: "Email", value: email },
            ]}
          />
          <ProfileQueuedLine />
        </Island>

        <Island
          title="On this device"
          description="Records stay here until DECA Mark acknowledges them."
          padded={false}
          testID="account-device"
        >
          {work.loading ? (
            <ListRow title="Reading records from this device…" />
          ) : work.error ? (
            <Note
              tone="attention"
              title="The records on this device could not be counted."
              action={
                <Button variant="ink" label="Try again" icon="rotate-cw" onPress={work.retry} />
              }
              testID="account-device-unread"
            >
              They are still on this device; nothing was removed.
            </Note>
          ) : (
            <>
              <ListRow
                title={<StateBadge kind="queue" state="onDevice" />}
                trailing={<Text variant="monoData">{`${work.onDevice}`}</Text>}
                accessibilityLabel={`On device: ${work.onDevice}`}
              />
              <ListRow
                divider
                title={<StateBadge kind="queue" state="attention" />}
                trailing={<Text variant="monoData">{`${work.attention}`}</Text>}
                accessibilityLabel={`Needs attention: ${work.attention}`}
              />
              <ListRow
                divider
                title={<StateBadge kind="queue" state="held" />}
                trailing={<Text variant="monoData">{`${work.held}`}</Text>}
                accessibilityLabel={`Held: ${work.held}`}
              />
              <ListRow
                divider
                title={<StateBadge kind="queue" state="uploaded" />}
                trailing={<Text variant="monoData">{`${work.uploaded}`}</Text>}
                accessibilityLabel={`Uploaded: ${work.uploaded}`}
              />
              <ListRow
                divider
                title="Unfinished observations"
                trailing={<Text variant="monoData">{`${work.drafts}`}</Text>}
              />
              {work.practice > 0 ? (
                <ListRow
                  divider
                  title="Practice records"
                  subtitle="Stay on this device and are never uploaded."
                  trailing={<Text variant="monoData">{`${work.practice}`}</Text>}
                  accessibilityLabel={`Practice records: ${work.practice}. They stay on this device and are never uploaded.`}
                  testID="account-practice"
                />
              ) : null}
            </>
          )}
        </Island>

        <Island title="Screen orientation">
          <RadioRows
            label="Screen orientation"
            options={ORIENTATION_CHOICES.map((choice) => ({
              value: choice,
              label: orientationLabels[choice],
            }))}
            value={orientation}
            onValueChange={(choice) => setOrientationProblem(chooseOrientation(choice))}
            testID="account-orientation"
          />
          {orientationProblem ? (
            <Note tone="attention" title={orientationProblem} />
          ) : (
            <Text variant="small" tone="ink2">
              {orientation === "device"
                ? "Every screen turns with the device."
                : `Every screen stays in ${orientation} until you change it here.`}
            </Text>
          )}
        </Island>

        <Island padded={false}>
          <ListRow
            title="Field guide"
            subtitle="How collecting works, readable with no signal."
            icon="book-open"
            onPress={() => router.push("/account/field-guide")}
          />
        </Island>

        <View style={s.actions}>
          <Button
            variant="outline"
            label="Sign out"
            icon="log-out"
            fullWidth
            onPress={() => router.push("/account/sign-out")}
            accessibilityHint="Shows what stays on this device before signing out."
            testID="account-sign-out"
          />
          <Button
            variant="danger"
            label="Review account deletion"
            icon="trash-2"
            fullWidth
            onPress={() => router.push("/account/delete-account")}
            accessibilityHint="Lists what deleting the account does. Nothing is deleted yet."
            testID="account-delete"
          />
          <View style={s.line}>
            <Text variant="small" tone="ink2">
              You can also delete your account on the web, signed in at decamark.vercel.app/account.
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}
