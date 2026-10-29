import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Island, ListRow, Mono, StateBadge, Text, type Theme, useStyles } from "../../ui";
import type { QueueRecord } from "../preview/fixtures";
import { placeLine, practiceOf, reasonOf, rowLabel } from "./rows";

function rowStyles(t: Theme) {
  return StyleSheet.create({
    status: { gap: t.space.s2 },
  });
}

/**
 * One observation in the list: its number, where and when, its queue state as a glyph, a word and a
 * colour, why it has not uploaded, and for practice that it never will. A record that needs attention
 * stands on the attention island.
 *
 * The row is one stop for a screen reader (A11Y-01): the outer view is the element and carries the whole
 * row's words (`rowLabel`); everything drawn inside is hidden from the reader, on iOS and on Android,
 * so neither VoiceOver nor TalkBack stops on the number, the badge and the reason one by one.
 */
export const ObservationRow = memo(function ObservationRow({ record }: { record: QueueRecord }) {
  const s = useStyles(rowStyles);
  const reason = reasonOf(record);
  const practice = practiceOf(record);
  return (
    <View
      testID={`observation-${record.id}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={rowLabel(record)}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Island padded={false} tone={record.state === "attention" ? "danger" : "default"}>
          <ListRow
            divider={false}
            title={
              <Mono size="bodyStrong" strong>
                {record.label}
              </Mono>
            }
            subtitle={placeLine(record)}
            status={
              <View style={s.status}>
                <StateBadge kind="queue" state={record.state} />
                {reason ? <Text variant="small">{reason}</Text> : null}
                {practice ? (
                  <Text variant="small" tone="ink2">
                    {practice}
                  </Text>
                ) : null}
              </View>
            }
          />
        </Island>
      </View>
    </View>
  );
});
