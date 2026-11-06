import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { ListRow, Mono, StateBadge, Text, type Theme, useStyles } from "../../ui";
import type { QueueRecord } from "../preview/fixtures";
import { placeLine, practiceOf, reasonOf, rowLabel } from "./rows";

/** Where a row sits in the one island the list draws: the first has the island's top edge, the last its bottom edge and ledge. */
export type RowPlace = { readonly first: boolean; readonly last: boolean };

function rowStyles(t: Theme) {
  const radius = t.radius.island;
  return StyleSheet.create({
    status: { gap: t.space.s2 },
    // The ledge band sits under the last row only, as the Island primitive draws it under the whole island.
    withLedge: { paddingBottom: t.size.ledge },
    ledge: {
      position: "absolute",
      left: 0,
      right: 0,
      top: t.size.ledge,
      bottom: 0,
      borderBottomLeftRadius: radius,
      borderBottomRightRadius: radius,
      backgroundColor: t.c.ledge,
    },
    // One island's edge, cut into one slice per row: the rules between rows are the ListRow dividers.
    slice: {
      overflow: "hidden",
      backgroundColor: t.c.island,
      borderColor: t.c.line,
      borderLeftWidth: t.size.border,
      borderRightWidth: t.size.border,
    },
    top: {
      borderTopWidth: t.size.border,
      borderTopLeftRadius: radius,
      borderTopRightRadius: radius,
    },
    bottom: {
      borderBottomWidth: t.size.border,
      borderBottomLeftRadius: radius,
      borderBottomRightRadius: radius,
    },
  });
}

/**
 * One observation in the list: its number, where and when, its queue state as a glyph, a word and a
 * colour, why it has not uploaded, and for practice that it never will. The rows of the list sit in one
 * island separated by rules (DESIGN, ListRow); a record that needs attention takes the attention-soft fill.
 *
 * The row is one stop for a screen reader (A11Y-01): the outer view is the element and carries the whole
 * row's words (`rowLabel`); everything drawn inside is hidden from the reader, on iOS and on Android,
 * so neither VoiceOver nor TalkBack stops on the number, the badge and the reason one by one.
 */
export const ObservationRow = memo(function ObservationRow({
  record,
  first,
  last,
}: { record: QueueRecord } & RowPlace) {
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
        <View style={last ? s.withLedge : null}>
          {last ? <View style={s.ledge} /> : null}
          <View style={[s.slice, first ? s.top : null, last ? s.bottom : null]}>
            <ListRow
              divider={!first}
              tone={record.state === "attention" ? "attention" : "default"}
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
          </View>
        </View>
      </View>
    </View>
  );
});
