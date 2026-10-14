import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { shortLabel } from "../../domain/labels";
import { roundLabel } from "../../domain/rounds";
import type { SiteZone } from "../../maps/sample-site";
import type { SessionSave } from "../../session/provider";
import {
  Button,
  FactsList,
  Icon,
  Island,
  Mono,
  Text,
  TextLink,
  type Theme,
  useStyles,
  useTheme,
} from "../../ui";

type Props = {
  readonly save: SessionSave;
  /** For an inventory: the next zone without one in this session, if any. */
  readonly nextZone: SiteZone | null;
  readonly formVersion: string;
  /** "map v3": the map the observation was recorded on (MUI-5). */
  readonly mapVersion: string;
  readonly onNext: () => void;
  readonly onInventoryZone: (zone: SiteZone) => void;
  readonly onChangeRound: () => void;
  readonly onRecords: () => void;
};

function savedStyles(t: Theme) {
  return StyleSheet.create({
    body: { paddingTop: t.space.s4, paddingBottom: t.space.s4, gap: t.space.s4 },
    tick: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.c.savedSoft,
    },
    head: { flexDirection: "row", alignItems: "center", gap: t.space.s3 },
    links: { flexDirection: "row", flexWrap: "wrap", gap: t.space.s5 },
  });
}

/**
 * Saved (MOB-26): what was stored, where it is, and what carries into the next record. The check
 * scales in once (unless motion is reduced) beside a success haptic fired by the caller. "Place the
 * next observation" returns to the map with no transition, because repeated collection is faster
 * without one.
 */
export function SavedStep({
  save,
  nextZone,
  formVersion,
  mapVersion,
  onNext,
  onInventoryZone,
  onChangeRound,
  onRecords,
}: Props) {
  const s = useStyles(savedStyles);
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.6);
  useEffect(() => {
    scale.value = withTiming(1, { duration: t.motion.duration.base });
  }, [scale, t.motion.duration.base]);
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inventory = save.roundType === "inventory";
  const time = new Date(save.savedAt);
  const clock = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  const zoneName = save.zoneLabel.split(" · ")[0] ?? save.zoneLabel;

  return (
    <ScrollView contentContainerStyle={s.body}>
      <Island tone="saved">
        <View style={{ gap: 12 }}>
          <View style={s.head}>
            <Animated.View style={[s.tick, tickStyle]}>
              <Icon name="check" size={26} color={t.c.saved} strokeWidth={2.5} />
            </Animated.View>
            <View style={{ flex: 1, gap: 2 }}>
              <Mono variant="label" tone="saved">
                {inventory ? `${zoneName} inventory saved` : "Saved on this device"}
              </Mono>
              <Mono variant="title">{shortLabel(save.id)}</Mono>
            </View>
          </View>
          <Text tone="ink2">{`${save.zoneLabel} · ${roundLabel(save.roundType)} · ${clock}`}</Text>
          <FactsList
            surface="ground"
            items={[
              {
                label: "Map and form",
                value: `${mapVersion.charAt(0).toUpperCase()}${mapVersion.slice(1)} · form ${formVersion}`,
              },
              {
                label: "Carried forward",
                value: inventory ? "Observer code and the round" : "Observer code, zone and round",
              },
              {
                label: "Cleared",
                value: inventory ? "Every inventory answer" : "Every play-event answer",
              },
              {
                label: "Upload",
                value: save.heldOnly
                  ? `Held on this device: form ${formVersion} is not published to the server yet`
                  : "Uploads by itself whenever the app is open and online",
              },
            ]}
          />
        </View>
      </Island>

      {inventory ? (
        nextZone ? (
          <Button
            label={`Inventory ${nextZone.label.split(" · ")[0] ?? nextZone.label} next`}
            icon="arrow-right"
            size="collector"
            fullWidth
            onPress={() => onInventoryZone(nextZone)}
          />
        ) : (
          <Button
            label="Finish the inventory round"
            icon="check"
            size="collector"
            fullWidth
            onPress={onChangeRound}
          />
        )
      ) : (
        <Button
          label="Place the next observation"
          icon="crosshair"
          size="collector"
          fullWidth
          onPress={onNext}
          testID="collect-next"
        />
      )}
      <View style={s.links}>
        <TextLink
          label={inventory ? "Choose another zone" : "Change zone or round"}
          icon="map"
          onPress={inventory ? onNext : onChangeRound}
        />
        <TextLink label="Records on this device" icon="list" onPress={onRecords} />
      </View>
    </ScrollView>
  );
}
