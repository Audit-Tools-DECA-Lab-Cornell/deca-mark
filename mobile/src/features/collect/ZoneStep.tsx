import { ScrollView, StyleSheet, View } from "react-native";
import type { SiteZone } from "../../maps/sample-site";
import type { SessionSave } from "../../session/provider";
import {
  Button,
  Mono,
  Note,
  type RadioOption,
  RadioRows,
  Text,
  TextLink,
  type Theme,
  useStyles,
} from "../../ui";

type Props = {
  readonly zones: readonly SiteZone[];
  readonly zone: SiteZone;
  /** The inventories saved in this session, newest first. */
  readonly saves: readonly SessionSave[];
  readonly blocked: string | null;
  /** A map tap on an edge between zones: say so, and leave the choice to the list (MUI-9). */
  readonly tapNote?: string | null | undefined;
  readonly onChoose: (zone: SiteZone) => void;
  readonly onStart: () => void;
  readonly onFinish: () => void;
};

function clock(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function zoneStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0 },
    body: { paddingTop: t.space.s4, paddingBottom: t.space.s4, gap: t.space.s4 },
    actions: {
      gap: t.space.s3,
      paddingTop: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
  });
}

/**
 * The Inventory round's first step: which zone is being recorded (Janet: "allow selection of the zone
 * they are entering it for"). Zones done in this session say when; the next one not done is the
 * obvious choice. A tap on a zone on the map chooses it too.
 */
export function ZoneStep({
  zones,
  zone,
  saves,
  blocked,
  tapNote = null,
  onChoose,
  onStart,
  onFinish,
}: Props) {
  const s = useStyles(zoneStyles);
  const done = new Map<string, string>();
  for (const save of [...saves].reverse())
    if (save.roundType === "inventory") done.set(save.zoneId, clock(save.savedAt));
  const options: RadioOption<string>[] = zones.map((entry) => {
    const at = done.get(entry.id);
    return {
      value: entry.id,
      label: entry.label,
      description: at ? `Inventory saved at ${at}` : "No inventory in this session yet",
      // While one zone's inventory is open, the others wait until it is saved or discarded.
      disabled: blocked !== null && entry.id !== zone.id,
    };
  });
  const every = zones.length > 0 && zones.every((entry) => done.has(entry.id));
  const name = zone.label.split(" · ")[0] ?? zone.label;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.body}>
        <View style={{ gap: 4 }}>
          <Mono variant="label" tone="accent">
            Inventory round
          </Mono>
          <Text variant="island" header>
            Which zone are you recording?
          </Text>
          <Text tone="ink2">
            Weather, wind, shade and the loose parts on hand, for one zone at a time. Tap a zone on
            the map or choose it here.
          </Text>
        </View>
        <RadioRows
          label="Zone"
          options={options}
          value={zone.id}
          onValueChange={(id) => {
            const next = zones.find((entry) => entry.id === id);
            if (next) onChoose(next);
          }}
        />
        {tapNote && !blocked ? (
          <Note tone="neutral" icon="map-pin" live="polite">
            {tapNote}
          </Note>
        ) : null}
        {blocked ? (
          <Note tone="waiting" icon="lock">
            {blocked}
          </Note>
        ) : null}
        {every ? (
          <Note tone="saved" title="Every zone has an inventory from this session.">
            Record a zone again if conditions change, or finish the round.
          </Note>
        ) : null}
      </ScrollView>
      <View style={s.actions}>
        <Button
          label={done.has(zone.id) ? `Record ${name} again` : `Start the ${name} inventory`}
          icon="list"
          size="collector"
          fullWidth
          onPress={onStart}
          testID="collect-start-inventory"
        />
        <TextLink label="Finish the inventory round" tone="ink" onPress={onFinish} />
      </View>
    </View>
  );
}
