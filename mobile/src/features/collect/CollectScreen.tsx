import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { shortLabel } from "../../domain/labels";
import { placesPoints, roundLabel } from "../../domain/rounds";
import { visibleQuestions } from "../../forms/engine";
import { useLayout } from "../../layout/use-layout";
import { useMapBase } from "../../maps/palette";
import type { SiteZone } from "../../maps/sample-site";
import { useFieldSession } from "../../session/provider";
import { useObservations } from "../../storage/use-observations";
import {
  announce,
  Button,
  IconButton,
  type ModeStep,
  ModeStrip,
  Mono,
  ScreenState,
  StatusLine,
  Text,
  type Theme,
  useHaptics,
  usePreferences,
  useStyles,
} from "../../ui";
import { keyboardLift, useKeyboardHeight } from "../../ui/use-keyboard-visible";
import { createAimStore } from "./aim-store";
import { CollectMap, type CollectMapHandle, type CollectMapMode } from "./CollectMap";
import { NUDGE_METRES, PlaceStep } from "./PlaceStep";
import { mapVersionLabel, saveBlock } from "./placement";
import { QuestionStep } from "./QuestionStep";
import { ReviewStep } from "./ReviewStep";
import { inventoriedZones, lastSavedLine, mapRecords, nextZoneToInventory } from "./records";
import { SavedStep } from "./SavedStep";
import { ZoneStep } from "./ZoneStep";

/** The internal steps of collecting. Play events start at Place; a zone inventory at Zone. */
type Step = "place" | "zone" | "answer" | "review" | "saved";

/** How long a chosen single answer shows before the next question (Contour `base`). */
const AUTO_ADVANCE_MS = 160;
/** The zoom "Zoom in to place" goes to: about 4 cm a point at a playground's latitude. */
const PRECISE_ZOOM = 20.5;

function collectStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.c.ground },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.s3,
      paddingHorizontal: t.space.s4,
      paddingTop: t.space.s2,
      paddingBottom: t.space.s2,
    },
    titles: { flex: 1, minWidth: 0 },
    strip: { paddingHorizontal: t.space.s4, paddingBottom: t.space.s2 },
    body: { flex: 1, minHeight: 0 },
    mapSlot: { padding: t.space.s3, paddingTop: 0 },
    // The slot while the keyboard is up: no height and no padding, by style. It stays mounted, and its
    // height changes at once, never by animation (DESIGN §8).
    mapSlotShut: { height: 0, padding: 0, overflow: "hidden" },
    mapOpen: { flex: 1 },
    // Inside a shut slot the map keeps the height it had, clipped, so the GL view is never resized.
    mapKept: { position: "absolute", top: 0, left: t.space.s3, right: t.space.s3 },
    panel: { minHeight: 0, paddingHorizontal: t.space.s4, paddingBottom: t.space.s3 },
    status: { paddingHorizontal: t.space.s4, paddingBottom: t.space.s2 },
  });
}

/**
 * Collect (MOB-26): one route with internal steps, so MapLibre stays mounted from the first point to
 * the hundredth. Place → Answer → Review → Saved for play events; Zone → Answer → Review → Saved for
 * an Inventory round. The dock is hidden here. X and Android back ask before leaving; back also steps
 * back through the steps. Phones stack the map over the panel; tablets and landscape put them side by
 * side, with the panel on the observer's preferred hand.
 *
 * The keyboard (MOB-34): the panel's bottom edge is lifted to the keyboard's top edge by padding, from
 * the keyboard's reported height (`keyboardLift`). Stacked over the map there is no room for both, so
 * the map slot shuts to zero height by style while the keyboard is up, with the status row. A phone in
 * landscape also drops the header, the mode strip and the links row. Nothing here animates, and the
 * map is never unmounted.
 */
export function CollectScreen() {
  const s = useStyles(collectStyles);
  const layout = useLayout();
  const { hand } = usePreferences();
  const haptics = useHaptics();
  const session = useFieldSession();
  const { records } = useObservations();
  const base = useMapBase();
  const insets = useSafeAreaInsets();
  const lift = keyboardLift(useKeyboardHeight(), insets.bottom);
  const mapRef = useRef<CollectMapHandle>(null);
  /** The map's height while the slot is open: a shut slot keeps the map at this size, clipped. */
  const [mapHeight, setMapHeight] = useState(0);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sitePackage, form, zone, roundType, placed, placementSource, state, saves } = session;
  const inventory = !placesPoints(roundType);

  const initialStep: Step = placed && session.inProgress ? "answer" : inventory ? "zone" : "place";
  const [step, setStep] = useState<Step>(initialStep);
  const [adjusting, setAdjusting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /** A map tap on an edge between zones while choosing an inventory's zone (MUI-9). */
  const [zoneNote, setZoneNote] = useState<string | null>(null);
  // The keyboard (MOB-34). Stacked, the map and the panel cannot both fit above it, on a tablet any
  // more than a phone, so the slot shuts. A phone's status row goes either way, and in landscape its
  // header, mode strip and links row go too: the answer and Continue are what it needs.
  const side = layout.wide;
  const keyboardUp = lift > 0;
  const shut = keyboardUp && !side && !expanded;
  const hideStatus = shut || (keyboardUp && !layout.tablet);
  const hideChrome = keyboardUp && !layout.tablet && side;
  const [aim] = useState(() =>
    createAimStore({
      centre: placed ?? zone?.centre ?? [0, 0],
      zoom: zone?.zoom ?? 18,
      moving: false,
    }),
  );

  // A chosen option moves on after a beat. Leaving the question by any other way first (Back, Review,
  // Adjust point, a jump, the mode strip) cancels that pending move, so it cannot undo the observer.
  const cancelAdvance = useCallback(() => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
  }, []);
  useEffect(() => cancelAdvance, [cancelAdvance]);

  // The save is announced once its card shows, with the record's label.
  const savedId = step === "saved" ? (saves[0]?.id ?? null) : null;
  useEffect(() => {
    if (savedId) announce(`${shortLabel(savedId)} saved on this device.`);
  }, [savedId]);

  // An inventory frames each zone as it is chosen.
  const zoneId = zone?.id;
  useEffect(() => {
    if (inventory && zoneId) mapRef.current?.fitZone();
  }, [inventory, zoneId]);

  const siteId = sitePackage?.siteId ?? "";
  const projectId = sitePackage?.projectId;
  const shownRecords = useMemo(
    () => mapRecords(records, siteId, projectId),
    [records, siteId, projectId],
  );
  const sessionIds = useMemo(() => new Set(saves.map((save) => save.id)), [saves]);
  const doneZones = useMemo(() => inventoriedZones(saves), [saves]);
  const unsent = records.filter(
    (record) => record.storageStatus === "pending" || record.storageStatus === "local-only",
  ).length;

  const leave = useCallback(() => {
    const open = session.inProgress !== null;
    const goBack = () => (router.canGoBack() ? router.back() : router.navigate("/"));
    if (!open) {
      goBack();
      return;
    }
    Alert.alert(
      "Leave? Your draft stays on this device",
      "The point and every answer so far are kept. Return to the site to carry on.",
      [
        { text: "Keep collecting", style: "cancel" },
        { text: "Leave", onPress: goBack },
      ],
    );
  }, [session.inProgress]);

  const stepBack = useCallback((): boolean => {
    cancelAdvance();
    if (step === "review") {
      setStep("answer");
      return true;
    }
    if (step === "answer") {
      const result = session.dispatch({ kind: "back" });
      if (result.destination === "map") setStep(inventory ? "zone" : "place");
      return true;
    }
    if (step === "place" && adjusting) {
      setAdjusting(false);
      setStep("answer");
      return true;
    }
    leave();
    return true;
  }, [adjusting, cancelAdvance, inventory, leave, session, step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", stepBack);
    return () => subscription.remove();
  }, [stepBack]);

  if (!sitePackage || !form || !zone)
    return (
      <SafeAreaView style={s.root}>
        <ScreenState
          kind="empty"
          icon="map"
          title="No site is open"
          body="Choose a site that is ready offline and set up the session. Your records on this device are unchanged."
          action={
            <Button
              variant="outline"
              icon="arrow-left"
              label="Back to projects"
              onPress={() => router.navigate("/")}
            />
          }
        />
      </SafeAreaView>
    );

  // The pinned map of this visit (MUI-5): its integer version, or a practice map's own label.
  const bound = session.pinned !== null;
  const version = session.pinned?.version ?? sitePackage.version;
  const mapLabel = mapVersionLabel(version);
  const placementBlock =
    placementSource === "hand" ? saveBlock(placed, zone, sitePackage.zones, bound, version) : null;
  const visible = visibleQuestions(form, state.answers);
  const index = Math.min(state.index, Math.max(visible.length - 1, 0));
  const question = visible[index];
  const last = saves[0] ?? null;

  function dispatchStep(action: Parameters<typeof session.dispatch>[0]) {
    const result = session.dispatch(action);
    cancelAdvance();
    const go = (destination: "stay" | "review" | "map") => {
      if (destination === "review") setStep("review");
      if (destination === "map") setStep(inventory ? "zone" : "place");
    };
    if (result.autoAdvance)
      advance.current = setTimeout(() => {
        advance.current = null;
        go(session.dispatch({ kind: "next" }).destination);
      }, AUTO_ADVANCE_MS);
    else go(result.destination);
  }

  async function placeHere() {
    // The map's own centre, not the last camera event: the stored point is exactly under the ×.
    const centre = (await mapRef.current?.exactCentre()) ?? aim.get().centre;
    session.place(centre);
    haptics.light();
    announce(adjusting ? "Point moved." : "Point placed. First question.");
    setAdjusting(false);
    setStep("answer");
  }

  function adjustPoint() {
    cancelAdvance();
    if (placed) mapRef.current?.moveTo(placed);
    setAdjusting(true);
    setStep("place");
  }

  function switchZone(next: SiteZone) {
    haptics.selection();
    setZoneNote(null);
    session.chooseZone(next);
    announce(`Zone changed to ${next.label}.`);
  }

  async function save() {
    const outcome = await session.save();
    if (!outcome.ok)
      return {
        problems: outcome.problems,
        ...(outcome.message ? { message: outcome.message } : {}),
      };
    haptics.success();
    setStep("saved");
    return null;
  }

  const mode: CollectMapMode =
    step === "place"
      ? "aim"
      : step === "zone"
        ? "zones"
        : step === "saved"
          ? "view"
          : placementSource === "hand"
            ? "placed"
            : "view";

  const stripSteps: readonly [string, string, string] = inventory
    ? ["Zone", "Answer", "Review"]
    : ["Place", "Answer", "Review"];
  const stripIndex: ModeStep =
    step === "answer" ? 1 : step === "review" || step === "saved" ? 2 : 0;
  const planName = base === "aerial" ? "Aerial" : base === "night" ? "Night plan" : "Day plan";
  const zoneName = zone.label;

  const map = (
    <CollectMap
      ref={mapRef}
      sitePackage={sitePackage}
      zone={zone}
      mode={mode}
      placed={placed}
      records={shownRecords}
      sessionIds={sessionIds}
      doneZones={doneZones}
      aim={aim}
      onAimSettled={() => {}}
      onZonePress={(next) => {
        if (session.zoneBlock) return;
        switchZone(next);
      }}
      onZoneNote={(note) => {
        if (session.zoneBlock) return;
        setZoneNote(note);
        announce(note);
      }}
      title={zoneName}
      detail={
        step === "place"
          ? "Move the map to put the × on the spot"
          : `${roundLabel(roundType)} · ${planName} · ${mapLabel.charAt(0).toUpperCase()}${mapLabel.slice(1)}`
      }
      expanded={expanded}
      onToggleExpanded={() => setExpanded(!expanded)}
    />
  );

  const panel = (
    <View style={{ flex: 1, minHeight: 0 }}>
      {step === "place" ? (
        <PlaceStep
          aim={aim}
          zones={sitePackage.zones}
          zone={zone}
          bound={bound}
          version={version}
          roundType={roundType}
          adjusting={adjusting}
          lastSaved={lastSavedLine(saves)}
          onPlace={() => {
            void placeHere();
          }}
          onKeep={() => {
            setAdjusting(false);
            if (placed) mapRef.current?.moveTo(placed);
            setStep("answer");
          }}
          onNudge={(direction) => {
            haptics.selection();
            mapRef.current?.nudge(direction, NUDGE_METRES);
          }}
          onZoomIn={() => mapRef.current?.moveTo(aim.get().centre, PRECISE_ZOOM)}
          onSwitchZone={switchZone}
        />
      ) : null}
      {step === "zone" ? (
        <ZoneStep
          zones={sitePackage.zones}
          zone={zone}
          saves={saves}
          blocked={session.zoneBlock}
          tapNote={zoneNote}
          onChoose={switchZone}
          onStart={() => {
            session.startZoneRecord();
            haptics.light();
            setStep("answer");
          }}
          onFinish={leave}
        />
      ) : null}
      {step === "answer" && question ? (
        <QuestionStep
          form={form}
          state={state}
          question={question}
          position={index + 1}
          total={visible.length}
          columns={layout.columns(question.columns)}
          onChoose={(option) => dispatchStep({ kind: "choose", question: question.id, option })}
          onToggle={(option) => dispatchStep({ kind: "toggle", question: question.id, option })}
          onWrite={(value) => dispatchStep({ kind: "write", question: question.id, value })}
          onBack={() => {
            stepBack();
          }}
          onAdvance={() => dispatchStep({ kind: "next" })}
          onReview={() => {
            cancelAdvance();
            setStep("review");
          }}
          onAdjust={placementSource === "hand" ? adjustPoint : undefined}
          keyboardUp={keyboardUp}
          showLinks={!hideChrome}
        />
      ) : null}
      {step === "review" ? (
        <ReviewStep
          form={form}
          state={state}
          summary={`${zone.label} · ${roundLabel(roundType)} · ${mapLabel} · form ${form.version}`}
          placementBlock={placementBlock}
          onAdjust={placementSource === "hand" ? adjustPoint : undefined}
          onJump={(target) => {
            session.dispatch({ kind: "jump", index: target });
            setStep("answer");
          }}
          onBack={() => setStep("answer")}
          onSave={save}
          onDiscard={() =>
            Alert.alert(
              "Discard this observation?",
              "Its point and answers are removed from this device.",
              [
                { text: "Keep it", style: "cancel" },
                {
                  text: "Discard observation",
                  style: "destructive",
                  onPress: () => {
                    session.discard();
                    setStep(inventory ? "zone" : "place");
                  },
                },
              ],
            )
          }
        />
      ) : null}
      {step === "saved" && last ? (
        <SavedStep
          save={last}
          nextZone={inventory ? nextZoneToInventory(sitePackage.zones, zone, doneZones) : null}
          formVersion={form.version}
          mapVersion={mapLabel}
          onNext={() => setStep(inventory ? "zone" : "place")}
          onInventoryZone={(next) => {
            session.chooseZone(next);
            setStep("zone");
          }}
          onChangeRound={() => (router.canGoBack() ? router.back() : router.navigate("/"))}
          onRecords={() => router.navigate("/observations")}
        />
      ) : null}
    </View>
  );

  const status = (
    <StatusLine
      live
      tone={last ? "saved" : "neutral"}
      icon={last ? "check" : placed ? "smartphone" : "map-pin"}
      text={
        last && step === "saved"
          ? `${shortLabel(last.id)} saved on this device`
          : placed && step !== "place"
            ? "Draft kept on this device as you answer"
            : `${sitePackage.name} · ready offline`
      }
      trailing={<Text variant="monoData" tone="ink2">{`${unsent} on device`}</Text>}
    />
  );

  const header = (
    <>
      <View style={s.header}>
        <IconButton icon="x" variant="outline" label="Leave collecting" onPress={leave} />
        <View style={s.titles}>
          <Text variant="bodyStrong">{sitePackage.name}</Text>
          <Text variant="small" tone="ink2">
            {`${zoneName} · ${roundLabel(roundType)} · `}
            <Mono variant="data" tone="ink2">
              {mapLabel}
            </Mono>
          </Text>
        </View>
      </View>
      {step !== "saved" ? (
        <View style={s.strip}>
          <ModeStrip
            steps={stripSteps}
            current={stripIndex}
            onSelect={(target) => {
              cancelAdvance();
              if (target === 0 && step !== "place" && step !== "zone") {
                if (inventory) {
                  if (!session.inProgress) setStep("zone");
                } else if (placed) adjustPoint();
                else setStep("place");
              }
              if (target === 1 && step === "review") setStep("answer");
            }}
          />
        </View>
      ) : null}
    </>
  );

  const panelWidth = layout.tablet ? Math.round(layout.width * 0.42) : layout.panelWidth;
  const panelBlock = expanded ? null : (
    <View
      testID="collect-panel"
      style={[
        side ? { width: panelWidth, minHeight: 0 } : { flex: 1, minHeight: 0 },
        { paddingBottom: lift },
      ]}
    >
      <View style={[s.panel, { flex: 1 }]}>{panel}</View>
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={["top", "bottom", "left", "right"]}>
      {hideChrome ? null : header}
      {side ? (
        <View style={[s.body, { flexDirection: hand === "left" ? "row-reverse" : "row" }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View testID="collect-map-slot" style={[s.mapSlot, { flex: 1 }]}>
              {map}
            </View>
            {hideStatus ? null : <View style={s.status}>{status}</View>}
          </View>
          {panelBlock}
        </View>
      ) : (
        <View style={s.body}>
          {/* The GL view's height changes instantly, never by animation (DESIGN §8). */}
          <View
            testID="collect-map-slot"
            style={[s.mapSlot, shut ? s.mapSlotShut : { height: expanded ? "100%" : "46%" }]}
            accessibilityElementsHidden={shut}
            importantForAccessibility={shut ? "no-hide-descendants" : "auto"}
          >
            <View
              testID="collect-map-frame"
              style={shut ? [s.mapKept, { height: mapHeight }] : s.mapOpen}
              onLayout={(event) => {
                if (!shut) setMapHeight(event.nativeEvent.layout.height);
              }}
            >
              {map}
            </View>
          </View>
          {expanded || hideStatus ? null : <View style={s.status}>{status}</View>}
          {panelBlock}
        </View>
      )}
    </SafeAreaView>
  );
}
