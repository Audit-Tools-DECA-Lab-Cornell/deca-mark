import { Stack } from "expo-router";
import { useTheme } from "../../../../src/ui";

/** The Observations tab's stack: the list of every record on this device. The dock stays. */
export default function ObservationsLayout() {
  const { c } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground } }} />
  );
}
