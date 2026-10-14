import { ScrollView, StyleSheet, View } from "react-native";
import { type RoundType, roundLabel } from "../../domain/rounds";
import { metresPerPixel } from "../../maps/clustering";
import {
  formatCoordinate,
  PRECISE_METRES_PER_PIXEL,
  placementPrecision,
} from "../../maps/geometry";
import type { SiteZone } from "../../maps/sample-site";
import {
  Button,
  IconButton,
  Mono,
  Note,
  RadioRows,
  Segmented,
  StateBadge,
  Text,
  TextLink,
  type Theme,
  useStyles,
} from "../../ui";
import type { AimStore } from "./aim-store";
import { useAimZone } from "./CollectMap";
import type { PlacementState } from "./placement";

type Direction = "north" | "south" | "east" | "west";

type Props = {
  readonly aim: AimStore;
  readonly zones: readonly SiteZone[];
  readonly zone: SiteZone;
  /** A map from DECA Mark: a point its zone does not cover cannot be placed (MUI-3). */
  readonly bound: boolean;
  /** The session's map version, from its pinned package: 3, or the practice map's own label. */
  readonly version: number | string;
  readonly roundType: RoundType;
  /** True when moving a point that is already placed: the answers stay. */
  readonly adjusting: boolean;
  readonly lastSaved: string | null;
  readonly onPlace: () => void;
  readonly onKeep: () => void;
  readonly onNudge: (direction: Direction) => void;
  readonly onZoomIn: () => void;
  readonly onSwitchZone: (zone: SiteZone) => void;
};

/** Half a metre: finer than a child's footprint, coarse enough to move in a few taps. */
export const NUDGE_METRES = 0.5;

const NUDGES: readonly {
  direction: Direction;
  icon: "arrow-left" | "arrow-up" | "arrow-down" | "arrow-right";
}[] = [
  { direction: "west", icon: "arrow-left" },
  { direction: "north", icon: "arrow-up" },
  { direction: "south", icon: "arrow-down" },
  { direction: "east", icon: "arrow-right" },
];

function placeStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0 },
    body: { paddingTop: t.space.s4, paddingBottom: t.space.s4, gap: t.space.s4 },
    where: { flexDirection: "row", alignItems: "center", gap: t.space.s2 },
    coords: {
      gap: 2,
      padding: t.space.s3,
      borderRadius: t.radius.panel,
      backgroundColor: t.c.well,
    },
    nudgeRow: { flexDirection: "row", alignItems: "center", gap: t.space.s2, flexWrap: "wrap" },
    actions: {
      gap: t.space.s3,
      paddingTop: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
  });
}

/**
 * Place (MOB-26, Janet's placement): the map moves under a fixed cross, the readout says where the
 * cross is and whether it is inside the session's zone, and nothing is placed until "Place point
 * here". Every gesture has a button beside it: the nudge pad moves the map half a metre at a time.
 */
export function PlaceStep({
  aim,
  zones,
  zone,
  bound,
  version,
  roundType,
  adjusting,
  lastSaved,
  onPlace,
  onKeep,
  onNudge,
  onZoomIn,
  onSwitchZone,
}: Props) {
  const s = useStyles(placeStyles);
  const { centre, zoom, moving, placement, hint } = useAimZone(aim, zones, zone, bound, version);
  const coarse = metresPerPixel(zoom, centre[1]) > PRECISE_METRES_PER_PIXEL;
  const [only] = placement.candidates;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.body}>
        <View style={{ gap: 4 }}>
          <Mono variant="label" tone="accent">
            {adjusting
              ? `Adjust point · ${roundLabel(roundType)}`
              : `Next observation · ${roundLabel(roundType)}`}
          </Mono>
          <Text variant="island" header>
            {adjusting ? "Move the × to the right spot" : "Put the × on the play"}
          </Text>
          <Text tone="ink2">
            Move the map until the cross sits where the play is happening. The pin lifts while the
            map moves, so the spot itself is never covered. Tap the map to jump the cross there.
          </Text>
        </View>

        <View
          style={s.where}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${placement.readout.replace("×", "cross")}.`}
        >
          <StateBadge
            label={placement.readout}
            icon={placement.glyph.icon}
            tone={placement.glyph.tone}
            size="sm"
          />
        </View>
        {placement.kind === "other" && only ? (
          <Button
            variant="outline"
            icon="map"
            label={`Switch to ${only.label}`}
            onPress={() => onSwitchZone(only)}
          />
        ) : null}
        {placement.kind === "edge" || placement.kind === "between" ? (
          <ZoneChoice placement={placement} onChoose={onSwitchZone} />
        ) : null}
        {hint ? (
          <Text variant="small" tone="ink2">
            {hint}
          </Text>
        ) : null}

        <View
          style={s.coords}
          accessible
          accessibilityLabel={`Coordinates ${formatCoordinate(centre)}`}
        >
          <Mono variant="data">{formatCoordinate(centre)}</Mono>
          <Text variant="small" tone="ink2">
            {moving ? "Moving…" : `Placed by hand · ${placementPrecision(zoom, centre[1])}`}
          </Text>
        </View>

        {coarse ? (
          <Note
            tone="neutral"
            icon="search"
            action={<TextLink label="Zoom in to place" icon="plus" onPress={onZoomIn} />}
          >
            Zoom in for a finer point: each step of the screen covers more than a footprint here.
          </Note>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text variant="smallStrong">Fine-tune</Text>
          <View style={s.nudgeRow}>
            {NUDGES.map(({ direction, icon }) => (
              <IconButton
                key={direction}
                variant="outline"
                icon={icon}
                label={`Move the cross ${direction} by half a metre`}
                onPress={() => onNudge(direction)}
              />
            ))}
            <Text variant="small" tone="ink2">
              Half a metre a tap
            </Text>
          </View>
        </View>

        {lastSaved ? (
          <Text variant="small" tone="ink2">
            {`Last saved on this device · ${lastSaved}`}
          </Text>
        ) : null}
      </ScrollView>

      <View style={s.actions}>
        <Button
          label={adjusting ? "Move the point here" : "Place point here"}
          icon="crosshair"
          size="collector"
          fullWidth
          onPress={onPlace}
          disabled={!placement.canPlace}
          disabledReason={placement.reason ?? undefined}
          accessibilityHint={`Places the observation at ${formatCoordinate(centre)}.`}
          testID="collect-place"
        />
        {adjusting ? (
          <TextLink label="Keep the point where it was" arrow="left" onPress={onKeep} />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The zones covering a cross on an edge: a two- or three-way choice with the session's zone kept, or
 * rows when more zones meet or none is chosen yet. Choosing one switches the session zone, as
 * "Switch to" does; the observer's choice is explicit, never the package's order (MUI-3).
 */
function ZoneChoice({
  placement,
  onChoose,
}: {
  readonly placement: PlacementState;
  readonly onChoose: (zone: SiteZone) => void;
}) {
  const options = placement.candidates.map((zone) => ({ value: zone.id, label: zone.label }));
  const choose = (id: string) => {
    const next = placement.candidates.find((zone) => zone.id === id);
    if (next && next.id !== placement.chosen?.id) onChoose(next);
  };
  if (placement.chosen && options.length <= 3)
    return (
      <Segmented
        label="Zone choice"
        options={options}
        value={placement.chosen.id}
        onValueChange={choose}
      />
    );
  return (
    <RadioRows
      label="Zone choice"
      options={options}
      value={placement.chosen?.id ?? null}
      onValueChange={choose}
    />
  );
}
