import { Stack } from "expo-router";

/** The Account tab's stack: Account, then Edit profile, the field guide, Sign out? and Delete account. */
export default function AccountLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
