import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import type { Answers } from "../../forms/definition";
import { isAnswered, visibleQuestions } from "../../forms/engine";
import { formFor } from "../../forms/registry";
import { useHostedSites } from "../../packages/hosted/context";
import { type Recovered, useRecoveredDraft } from "../../packages/zone-read-models";
import { useFieldSession } from "../../session/provider";
import {
  announce,
  Button,
  Island,
  Text,
  TextLink,
  type Theme,
  useHaptics,
  useOnline,
  useStyles,
} from "../../ui";
import { useDataSource } from "../preview/data-source";
import { unfinishedSentence, unfinishedTitle } from "./readiness";
import { type RecoveryAction, recoveryCard, redownloadProblem } from "./recovery";

/** The bundled package the preview's sample draft belongs to (Riverside, as Mobile 10 draws it). */
const PREVIEW_PACKAGE = "riverside-play-study";

type Unfinished =
  /** A draft left by a force quit or a restart, with its exact map and zone (MUI-7). */
  | {
      readonly kind: "recovered";
      readonly model: Recovered | null;
      readonly problem: string | null;
    }
  /**
   * A recovered draft from a map that ships with the app (practice): it has no hosted map to pin, so
   * the field session resumes or discards it as it is.
   */
  | { readonly kind: "unbound"; readonly title: string; readonly sentence: string }
  /**
   * A stored draft this build cannot read (MOB-41): it blocks every new observation, so the card
   * offers the one way out, a confirmed discard.
   */
  | { readonly kind: "unreadable" }
  /** An observation still open in this session. */
  | { readonly kind: "open"; readonly title: string; readonly sentence: string }
  | { readonly kind: "sample"; readonly title: string; readonly sentence: string };

function countAnswered(answers: Answers): number {
  return Object.values(answers).filter((value) => isAnswered(value)).length;
}

const NOT_REOPENED = "This draft could not be reopened here. It stays on this device.";

/** Discards a kept draft and says whether it went: a failed discard leaves it on this device. */
function discardKept(discard: () => Promise<void>) {
  void discard().then(
    () => announce("Draft discarded."),
    () => announce("The draft could not be discarded. It stays on this device."),
  );
}

/**
 * The unfinished observation the field session holds, if any: a draft recovered after a force quit
 * first (it is offered back before anything else), then an observation still open. Preview data shows
 * the designed sample when the device has neither.
 */
export function useUnfinished(): Unfinished | null {
  const session = useFieldSession();
  const recovery = useRecoveredDraft();
  const { mode } = useDataSource();
  const { recovered, inProgress } = session;

  if (session.unreadableDraft && !recovered && !inProgress) return { kind: "unreadable" };
  if (recovered && !recovered.binding) {
    const form = formFor(recovered.formVersion);
    return {
      kind: "unbound",
      title: unfinishedTitle(recovered.context.zoneLabel, recovered.context.roundType),
      sentence: unfinishedSentence({
        placed: recovered.coordinates !== null,
        answered: countAnswered(recovered.answers),
        asked: form ? visibleQuestions(form, recovered.answers).length : 0,
      }),
    };
  }
  if (recovered) return { kind: "recovered", model: recovery.active, problem: recovery.problem };
  if (inProgress) {
    const answers = session.state.answers;
    return {
      kind: "open",
      title: unfinishedTitle(session.zone?.label ?? inProgress.packageName, session.roundType),
      sentence: unfinishedSentence({
        placed: session.placed !== null,
        answered: countAnswered(answers),
        asked: session.form ? visibleQuestions(session.form, answers).length : 0,
      }),
    };
  }
  if (mode === "preview")
    return {
      kind: "sample",
      title: "North meadow · Round 1",
      sentence: "Point placed, 3 of 8 answered. Kept on this device.",
    };
  return null;
}

function cardStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s5 },
    lines: { gap: t.space.s2 },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: t.space.s6,
      rowGap: t.space.s3,
    },
  });
}

/**
 * "Unfinished observation" on Projects (Mobile 10): the accent card for the one thing to pick up again.
 * Resume returns to collect on the observation's own map, zone and answers. When that map is missing
 * the card says so and offers it again; when it cannot be resumed it can be kept for later, which frees
 * collection without discarding it. "Discard draft" asks first.
 */
export function UnfinishedCard({ unfinished }: { unfinished: Unfinished }) {
  if (unfinished.kind === "recovered") return <RecoveredCard unfinished={unfinished} />;
  if (unfinished.kind === "unreadable") return <UnreadableDraftCard />;
  return <OpenCard unfinished={unfinished} />;
}

/**
 * The card for a stored draft that cannot be read (MOB-41). Nothing can be resumed or kept for later,
 * and until it goes no map can be set up, so the only action is "Discard draft", which asks first and
 * then clears it through the field session; the card disappears once the session no longer holds it.
 */
export function UnreadableDraftCard() {
  const s = useStyles(cardStyles);
  const session = useFieldSession();
  const haptics = useHaptics();
  if (!session.unreadableDraft) return null;
  return (
    <Island tone="accent" eyebrow="Unfinished observation" title="A draft this app cannot read">
      <View style={s.body}>
        <Text tone="ink2">
          An unfinished observation is stored on this device, but this version of DECA Mark cannot
          open it. Until it is discarded, no new observation can be started.
        </Text>
        <View style={s.actions}>
          <TextLink
            label="Discard draft"
            tone="ink"
            onPress={() =>
              confirmDiscard(() => {
                haptics.warning();
                discardKept(session.discardRecovered);
              }, UNREADABLE_BODY)
            }
            accessibilityHint="Asks before removing the draft from this device."
            testID="projects-discard"
          />
        </View>
      </View>
    </Island>
  );
}

const UNREADABLE_BODY =
  "The draft cannot be opened, so its point and answers cannot be recovered. It is removed from this device. Nothing was uploaded.";

function OpenCard({
  unfinished,
}: {
  unfinished: Exclude<Unfinished, { kind: "recovered" | "unreadable" }>;
}) {
  const s = useStyles(cardStyles);
  const session = useFieldSession();
  const haptics = useHaptics();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (hidden) return null;

  async function resume() {
    if (busy) return;
    setProblem(null);
    if (unfinished.kind === "open") {
      router.push("/collect");
      return;
    }
    setBusy(true);
    try {
      if (unfinished.kind === "unbound") {
        const opened = await session.resumeRecovered();
        if (opened) router.push("/collect");
        else {
          setProblem(NOT_REOPENED);
          announce(NOT_REOPENED);
        }
        return;
      }
      // Preview: the sample has no answers to restore, so collect opens on its bundled package.
      const outcome = await session.openPackage(PREVIEW_PACKAGE);
      if (outcome.ok) router.push("/collect");
      else {
        setProblem(outcome.reason);
        announce(outcome.reason);
      }
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    confirmDiscard(() => {
      haptics.warning();
      if (unfinished.kind === "unbound") {
        discardKept(session.discardRecovered);
        return;
      }
      if (unfinished.kind === "open") session.discard();
      else setHidden(true);
      announce("Draft discarded.");
    });
  }

  return (
    <Island tone="accent" eyebrow="Unfinished observation" title={unfinished.title}>
      <View style={s.body}>
        <Text tone="ink2">{unfinished.sentence}</Text>
        {problem ? <Text tone="attention">{problem}</Text> : null}
        <View style={s.actions}>
          <Button
            label="Resume"
            icon="arrow-right"
            busy={busy}
            busyLabel="Opening…"
            onPress={() => void resume()}
            accessibilityHint="Returns to collect with the point and answers as they were."
            testID="projects-resume"
          />
          <TextLink
            label="Discard draft"
            tone="ink"
            onPress={discard}
            accessibilityHint="Asks before removing the draft from this device."
            testID="projects-discard"
          />
        </View>
      </View>
    </Island>
  );
}

function confirmDiscard(
  onDiscard: () => void,
  body = "The point and answers in this unfinished observation are removed from this device. Nothing was uploaded.",
) {
  Alert.alert("Discard this draft?", body, [
    { text: "Keep draft", style: "cancel" },
    { text: "Discard draft", style: "destructive", onPress: onDiscard },
  ]);
}

function RecoveredCard({ unfinished }: { unfinished: Extract<Unfinished, { kind: "recovered" }> }) {
  const s = useStyles(cardStyles);
  const recovery = useRecoveredDraft();
  const haptics = useHaptics();
  const online = useOnline();
  const [busy, setBusy] = useState<RecoveryAction | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { downloads } = useHostedSites();
  const model = unfinished.model;

  if (!model)
    return (
      <Island tone="accent" eyebrow="Unfinished observation" title="Kept on this device">
        <Text tone={unfinished.problem ? "attention" : "ink2"}>
          {unfinished.problem ?? "Reading the map and zone this observation was opened on…"}
        </Text>
      </Island>
    );
  const card = recoveryCard(model, online);
  const failed = redownloadProblem(model, downloads[model.pinned.siteId]);

  async function run(action: RecoveryAction) {
    if (busy) return;
    setProblem(null);
    setBusy(action);
    try {
      if (action === "resume") {
        const opened = await recovery.resume();
        if (opened) router.push("/collect");
        else {
          setProblem(NOT_REOPENED);
          announce(NOT_REOPENED);
        }
      }
      if (action === "redownload") await recovery.redownload(model?.draftId ?? "");
      if (action === "park") {
        await recovery.park();
        announce("Kept for later. You can start collecting again.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Island tone="accent" eyebrow="Unfinished observation" title={card.title}>
      <View style={s.body}>
        <View style={s.lines}>
          {card.lines.map((line) => (
            <Text key={line} tone="ink2">
              {line}
            </Text>
          ))}
        </View>
        {problem ? <Text tone="attention">{problem}</Text> : null}
        {failed ? <Text tone="attention">{failed}</Text> : null}
        <View style={s.actions}>
          {card.actions.includes("resume") ? (
            <Button
              label="Resume"
              icon="arrow-right"
              busy={busy === "resume"}
              busyLabel="Opening…"
              onPress={() => void run("resume")}
              accessibilityHint={`Returns to collect on ${card.title}, with the point and answers as they were.`}
              testID="projects-resume"
            />
          ) : null}
          {card.actions.includes("redownload") && card.redownloadLabel ? (
            <Button
              variant="outline"
              label={card.redownloadLabel}
              icon="download"
              busy={busy === "redownload"}
              busyLabel="Downloading…"
              onPress={() => void run("redownload")}
              testID="projects-redownload"
            />
          ) : null}
          {card.actions.includes("park") ? (
            <TextLink
              label={card.parkLabel}
              onPress={() => void run("park")}
              accessibilityHint="Keeps this observation and its answers on this device, and frees collection for new work."
              testID="projects-park"
            />
          ) : null}
          <TextLink
            label="Discard draft"
            tone="ink"
            onPress={() =>
              confirmDiscard(() => {
                haptics.warning();
                discardKept(recovery.discard);
              })
            }
            accessibilityHint="Asks before removing the draft from this device."
            testID="projects-discard"
          />
        </View>
      </View>
    </Island>
  );
}

/**
 * "Kept for later" on Projects: observations parked because they could not be resumed. Each keeps its
 * exact map, zone and answers. Resume restores it through the field session, which reopens it on its
 * own map and zone, then opens collect; once nothing else is unfinished, otherwise it waits. A restore
 * that cannot reopen it (its map or access changed since) says so and leaves it kept.
 */
export function ParkedDrafts() {
  const s = useStyles(cardStyles);
  const recovery = useRecoveredDraft();
  const session = useFieldSession();
  const haptics = useHaptics();
  const online = useOnline();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { downloads } = useHostedSites();
  const occupied = session.recovered !== null || session.inProgress !== null;

  // Once a restore has settled, the session either holds the draft open on its map, or it does not.
  const { inProgress } = session;
  useEffect(() => {
    if (!settled) return;
    setSettled(false);
    if (inProgress) {
      router.push("/collect");
      return;
    }
    setProblem(NOT_REOPENED);
    announce(NOT_REOPENED);
  }, [settled, inProgress]);

  async function restore(draftId: string) {
    if (restoring) return;
    setProblem(null);
    setRestoring(draftId);
    try {
      await recovery.restoreParked(draftId);
    } catch {
      // A failed restore leaves the draft kept; the effect above says it could not be reopened.
    } finally {
      setRestoring(null);
      setSettled(true);
    }
  }

  if (recovery.parked.length === 0) return null;
  return (
    <Island eyebrow="Kept for later" title={`${recovery.parked.length} unfinished on this device`}>
      <View style={s.body}>
        {problem ? <Text tone="attention">{problem}</Text> : null}
        {recovery.parked.map((model) => {
          const card = recoveryCard(model, online);
          const failed = redownloadProblem(model, downloads[model.pinned.siteId]);
          return (
            <View key={model.draftId} style={s.lines}>
              <Text variant="bodyStrong">{card.title}</Text>
              {card.lines.map((line) => (
                <Text key={line} tone="ink2">
                  {line}
                </Text>
              ))}
              {failed ? <Text tone="attention">{failed}</Text> : null}
              <View style={s.actions}>
                {card.actions.includes("resume") ? (
                  <Button
                    variant="outline"
                    label="Resume"
                    icon="arrow-right"
                    busy={restoring === model.draftId}
                    busyLabel="Opening…"
                    disabled={occupied}
                    disabledReason="Resume or discard the unfinished observation above first."
                    onPress={() => void restore(model.draftId)}
                  />
                ) : null}
                {card.actions.includes("redownload") && card.redownloadLabel ? (
                  <Button
                    variant="outline"
                    label={card.redownloadLabel}
                    icon="download"
                    onPress={() => void recovery.redownload(model.draftId)}
                  />
                ) : null}
                <TextLink
                  label="Discard draft"
                  tone="ink"
                  onPress={() =>
                    confirmDiscard(() => {
                      haptics.warning();
                      discardKept(() => recovery.discardParked(model.draftId));
                    })
                  }
                />
              </View>
            </View>
          );
        })}
      </View>
    </Island>
  );
}
