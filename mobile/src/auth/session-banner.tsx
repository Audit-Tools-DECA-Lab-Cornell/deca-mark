import { View } from "react-native";
import { AttentionNote, LinkAction } from "../components/chrome";
import { openResumeSignIn } from "../features/auth/ResumeUploadsNote";
import { space } from "../theme";
import { useAccount } from "./provider";

/** The legacy Nocturne screens' banner (records); Contour screens show `ResumeUploadsNote`. */
export function SessionBanner() {
  const { recovery } = useAccount();
  if (!recovery) return null;
  return (
    <View style={{ paddingHorizontal: space.loose, paddingVertical: space.snug }}>
      <AttentionNote title="Sign in to resume uploads" />
      <LinkAction
        label="Sign in"
        onPress={() => openResumeSignIn(recovery.email)}
        style={{ alignSelf: "flex-start", marginTop: space.tight }}
      />
    </View>
  );
}
