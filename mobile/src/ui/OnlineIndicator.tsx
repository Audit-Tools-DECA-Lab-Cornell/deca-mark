import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { Icon, isIconName } from "./Icon";
import { Text } from "./Text";
import { type Theme, useStyles, useTheme } from "./theme";
import { stateOf } from "./tokens";

type Connection = {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null | undefined;
};
type NetInfoModule = typeof import("@react-native-community/netinfo");

/**
 * NetInfo throws on import when the native module is missing (a development build made before it was
 * added). The indicator then stays hidden instead of taking the screen down, as the sync provider does.
 */
function loadNetInfo(): NetInfoModule | null {
  try {
    return require("@react-native-community/netinfo") as NetInfoModule;
  } catch {
    return null;
  }
}

const netInfo = loadNetInfo();
const unavailable = (): Connection | null => null;
// Chosen once per process, so the hook order never changes between renders.
const useConnection: () => Connection | null = netInfo ? netInfo.useNetInfo : unavailable;

export type OnlineIndicatorProps = {
  /** Overrides the device's network state, when the caller already knows it. */
  online?: boolean | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string | undefined;
};

function onlineStyles(t: Theme) {
  return StyleSheet.create({
    indicator: { flexDirection: "row", alignItems: "center", gap: t.space.s2 },
  });
}

/** Whether the device can reach the network, or null until it has said (or cannot say). */
export function useOnline(): boolean | null {
  const connection = useConnection();
  return connection === null || connection.isConnected === null
    ? null
    : connection.isConnected && connection.isInternetReachable !== false;
}

/** Whether the device can reach the network: a quiet "Online", or "Offline" in the waiting tone. */
export function OnlineIndicator({ online, style, testID }: OnlineIndicatorProps) {
  const t = useTheme();
  const s = useStyles(onlineStyles);
  const device = useOnline();
  const known = online ?? device;
  // Until the device has answered, say nothing rather than guess.
  if (known === null) return null;

  const state = stateOf("connection", known ? "online" : "offline");
  const icon = isIconName(state.icon) ? state.icon : known ? "wifi" : "wifi-off";
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={state.label}
      accessibilityLiveRegion="polite"
      style={[s.indicator, style]}
    >
      <Icon name={icon} size={20} color={known ? t.c.ink2 : t.c.waiting} />
      <Text variant={known ? "body" : "bodyStrong"} tone={known ? "ink2" : "waiting"}>
        {state.label}
      </Text>
    </View>
  );
}
