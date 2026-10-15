import { router } from "expo-router";
import { useAccount } from "../../auth/provider";
import { Button, Note } from "../../ui";

/** The sign-in a lost session needs, with the cached account's email filled in (MOB-08, MOB-03). */
export function openResumeSignIn(email: string): void {
  router.push({ pathname: "/sign-in", params: email ? { email } : {} });
}

/**
 * "Sign in to resume uploads" (MOB-08): the account is still on this device, so the app stays open and
 * collecting works, but its session was lost and nothing uploads until it signs in again. The gate keeps
 * sign-in open in that state (MOB-03), so the button opens it over the app.
 */
export function ResumeUploadsNote() {
  const { recovery } = useAccount();
  if (!recovery) return null;
  const owner = recovery.email || "this account";
  return (
    <Note
      tone="attention"
      title="Sign in to resume uploads"
      action={
        <Button
          variant="ink"
          label="Sign in"
          icon="log-in"
          onPress={() => openResumeSignIn(recovery.email)}
          accessibilityHint="Opens sign-in with this account's email filled in."
          testID="resume-uploads-sign-in"
        />
      }
      testID="resume-uploads"
    >
      {`Your records stay on this device for ${owner}. They upload once you sign in again.`}
    </Note>
  );
}
