import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Icon, PRESSED_OPACITY, Text, type Theme, useStyles, useTheme } from "../../ui";
import { ALL_ZONES } from "./rows";

export type ZoneChipsProps = {
  /** The zones to offer, besides "All zones". */
  zones: readonly string[];
  /** The chosen zone, or null for all of them. */
  value: string | null;
  onChange: (zone: string | null) => void;
};

function chipStyles(t: Theme) {
  return StyleSheet.create({
    row: { gap: t.space.s2, paddingVertical: t.space.s1 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.s2,
      minHeight: t.size.touch,
      paddingHorizontal: t.space.s4,
      paddingVertical: t.space.s2,
      borderRadius: t.radius.pill,
      borderWidth: t.size.border,
      borderColor: t.c.line,
    },
    chosen: { backgroundColor: t.c.ink, borderColor: t.c.ink },
    pressed: { opacity: PRESSED_OPACITY },
  });
}

/**
 * The zone filter of the Observations list (DESIGN, the `chips` variant): the chosen zone is an ink pill
 * with a check, the others are outlined in `line`, and the row scrolls sideways. A chip's label wraps
 * rather than truncates, so a long zone name makes a wide chip. The group is read as one radio group.
 */
export function ZoneChips({ zones, value, onChange }: ZoneChipsProps) {
  const t = useTheme();
  const s = useStyles(chipStyles);
  const options: { zone: string | null; label: string }[] = [
    { zone: null, label: ALL_ZONES },
    ...zones.map((zone) => ({ zone, label: zone })),
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Zone" testID="observations-zones">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((option) => {
          const chosen = option.zone === value;
          return (
            <Pressable
              key={option.zone ?? ALL_ZONES}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: chosen }}
              onPress={() => {
                if (!chosen) onChange(option.zone);
              }}
              style={({ pressed }) => [
                s.chip,
                chosen ? s.chosen : null,
                pressed ? s.pressed : null,
              ]}
            >
              {chosen ? <Icon name="check" size={18} color={t.c.onInk} /> : null}
              <Text variant="bodyStrong" tone={chosen ? "onInk" : "ink"}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
