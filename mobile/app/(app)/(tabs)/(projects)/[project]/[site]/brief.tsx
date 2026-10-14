import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  placesPoints,
  ROUND_TYPES,
  ROUNDS,
  type RoundType,
} from "../../../../../../src/domain/rounds";
import { useSite } from "../../../../../../src/features/preview";
import { PageIntro, useAccountInitials } from "../../../../../../src/features/projects/parts";
import { startBlock } from "../../../../../../src/features/projects/recovery";
import {
  UnfinishedCard,
  useUnfinished,
} from "../../../../../../src/features/projects/UnfinishedCard";
import { briefVersionNote } from "../../../../../../src/features/projects/versions";
import { useHostedSites } from "../../../../../../src/packages/hosted/context";
import {
  useRecoveredDraft,
  useSiteVersions,
} from "../../../../../../src/packages/zone-read-models";
import { useFieldSession } from "../../../../../../src/session/provider";
import { offersRound } from "../../../../../../src/session/round-forms";
import {
  Button,
  Field,
  Icon,
  Island,
  Mono,
  Note,
  type RadioOption,
  RadioRows,
  Screen,
  ScreenHeader,
  ScreenState,
  StateBadge,
  Switch,
  Text,
  TextInput,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
  useTheme,
} from "../../../../../../src/ui";

/** The answer every form stamps the observer code into (`observer` in its export). */
const OBSERVER_COLUMN = "observer";
const OBSERVER_MAX = 10;

function briefStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    pair: { flexDirection: "row", flexWrap: "wrap", gap: t.space.s4 },
    half: { flexGrow: 1, flexBasis: 150 },
    hint: { marginTop: -t.space.s3 },
    locked: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: t.space.s3,
      paddingTop: t.space.s4,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
    lockedText: { flex: 1 },
    fresh: { paddingHorizontal: 0 },
    actions: { gap: t.space.s4 },
    guide: { alignSelf: "center" },
    collects: { gap: t.space.s3 },
    notes: { gap: t.space.s4, marginTop: t.space.s2 },
    noteItem: { gap: t.space.s1 },
  });
}

/**
 * Before you begin (Mobile 14): the zone, the round and the observer code for this session, then
 * collection. The site's package is already open in the field session ("Set up this session"); the
 * choices go straight into it (`chooseZone`, `chooseRound`, the fresh-period switch), and the observer
 * code is written as the form's own observer answer, so it is carried into every record of the session.
 * The map and form versions stay locked while the session runs.
 *
 * Under the actions: what the site collects (form, version, inclusion) and the protocol decisions the
 * source workbook leaves open, as the brief has always carried them.
 */
export default function BriefScreen() {
  const s = useStyles(briefStyles);
  const t = useTheme();
  const params = useLocalSearchParams<{ project: string; site: string }>();
  const siteId = typeof params.site === "string" ? params.site : "";
  const site = useSite(siteId);
  const session = useFieldSession();
  const account = useAccountInitials();
  const haptics = useHaptics();
  const [notesOpen, setNotesOpen] = useState(false);
  const { sitePackage, form, zone, roundType, freshPeriod, inProgress } = session;
  const unfinished = useUnfinished();
  const recovery = useRecoveredDraft();
  const hosted = useHostedSites();
  const versions = useSiteVersions(siteId);

  const observerQuestion = form?.questions.find(
    (question) => question.exportColumn === OBSERVER_COLUMN && question.kind === "text",
  );
  const observerAnswer = observerQuestion ? session.state.answers[observerQuestion.id] : undefined;
  const observer = typeof observerAnswer === "string" ? observerAnswer : "";

  // The observer code starts from the profile's initials; an edit here holds for this session only.
  const { dispatch } = session;
  const questionId = observerQuestion?.id;
  const initials = account.initials;
  const packageId = sitePackage?.id ?? null;
  // Once per opened package, so clearing the field to type another code does not refill it.
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    if (!questionId || !packageId || !initials || prefilled.current === packageId) return;
    prefilled.current = packageId;
    if (observerAnswer === undefined)
      dispatch({ kind: "write", question: questionId, value: initials });
  }, [questionId, packageId, observerAnswer, initials, dispatch]);

  // The session's map is the newest verified one on this device, which may be older than the site
  // list's published package (MUI-1): the Brief opens for either, as long as it is this site's.
  const opened =
    sitePackage &&
    form &&
    zone &&
    site &&
    (sitePackage.id === site.packageId || sitePackage.siteId === site.id);
  if (!opened)
    return (
      <Screen scroll dock testID="brief-closed">
        <ScreenHeader back />
        <ScreenState
          kind="empty"
          icon="layers"
          title="Set up a site first"
          body="Open a site that is ready offline and choose Set up this session. Its map and form open on this device, then this step confirms the zone and round."
          action={
            <Button
              variant="outline"
              icon="arrow-left"
              label="Back to the site"
              onPress={() => (router.canGoBack() ? router.back() : router.navigate("/"))}
            />
          }
        />
      </Screen>
    );

  const zones: RadioOption<string>[] = sitePackage.zones.map((entry) => ({
    value: entry.id,
    label: entry.label,
    disabled: session.zoneBlock !== null && entry.id !== zone.id,
  }));
  const rounds: RadioOption<RoundType>[] = ROUND_TYPES.map((type) => ({
    value: type,
    label: ROUNDS[type].label,
    description: ROUNDS[type].description,
    disabled:
      (session.roundBlock !== null && type !== roundType) || !offersRound(sitePackage, type),
  }));
  const inventory = !placesPoints(roundType);
  const openHere = inProgress !== null && inProgress.packageId === sitePackage.id;
  // Only a resumable observation holding the active slot stops a new visit (MUI-7); it names its site.
  const activeSite = recovery.active
    ? Object.values(hosted.sites)
        .flat()
        .find((entry) => entry.site_id === recovery.active?.pinned.siteId)
    : undefined;
  const blocked = startBlock(
    recovery.active,
    activeSite?.name ??
      (recovery.active?.pinned.siteId === sitePackage.siteId ? sitePackage.name : null),
    openHere,
  );
  // Which map this session uses, and why it differs from the published one (MUI-10).
  const versionText = session.pinned ? briefVersionNote(session.pinned.version, versions) : null;
  const versionNote = versionText
    ? {
        text: versionText,
        published: (versions.available?.version ?? 0) > (session.pinned?.version ?? 0),
      }
    : null;
  const unfinishedHere =
    unfinished?.kind === "recovered" && unfinished.model?.pinned.siteId === sitePackage.siteId
      ? unfinished
      : null;
  const notes = form.protocolNotes;

  return (
    <Screen scroll keyboard dock testID="brief">
      <ScreenHeader
        back
        trailing={
          <StateBadge
            kind="readiness"
            state="readyOffline"
            label={`${site.name} ready offline`}
            size="sm"
          />
        }
      />
      <View style={s.body}>
        <PageIntro
          title="Before you begin"
          lead="Choose the round, then where you are observing."
        />
        {unfinishedHere ? <UnfinishedCard unfinished={unfinishedHere} /> : null}

        <Field label="Round">
          <RadioRows
            options={rounds}
            value={roundType}
            onValueChange={(next) => {
              haptics.selection();
              session.chooseRoundType(next);
            }}
            label="Round"
            testID="brief-round"
          />
        </Field>
        {session.roundBlock ? (
          <Note tone="waiting" icon="lock">
            {session.roundBlock}
          </Note>
        ) : null}
        {roundType === "reliability" ? (
          <Note tone="neutral" icon="users">
            Agree the zone and start time with the other observer, then code independently. Your
            records are marked as a reliability round so the two codings can be compared.
          </Note>
        ) : null}

        <Field label={inventory ? "Zone to inventory first" : "Zone"}>
          <RadioRows
            options={zones}
            value={zone.id}
            onValueChange={(id) => {
              const next = sitePackage.zones.find((entry) => entry.id === id);
              if (!next) return;
              haptics.selection();
              session.chooseZone(next);
            }}
            label="Zone"
            testID="brief-zone"
          />
        </Field>

        {inventory ? (
          <Text variant="small" tone="ink2" style={s.hint}>
            You can choose each zone in turn while collecting; the map marks the zones done.
          </Text>
        ) : null}

        <View style={s.pair}>
          {observerQuestion ? (
            <View style={s.half}>
              <Field label="Observer code">
                <TextInput
                  value={observer}
                  onChangeText={(value) =>
                    session.dispatch({
                      kind: "write",
                      question: observerQuestion.id,
                      value: value.toUpperCase().replace(/\s+/g, "").slice(0, OBSERVER_MAX),
                    })
                  }
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={OBSERVER_MAX}
                  accessibilityHint="Recorded with every observation in this session."
                  testID="brief-observer"
                />
              </Field>
            </View>
          ) : null}
        </View>
        <Switch
          label="First round of this observation period"
          description={
            freshPeriod
              ? "Nothing is carried over from an earlier round."
              : sitePackage.inheritedContext
          }
          checked={freshPeriod}
          onCheckedChange={() => session.toggleFreshPeriod()}
          style={s.fresh}
          testID="brief-fresh"
        />

        {versionNote ? (
          <Note tone={versionNote.published ? "waiting" : "neutral"} icon="layers">
            {versionNote.text}
          </Note>
        ) : null}
        <View
          style={s.locked}
          accessible
          accessibilityLabel={`Map ${sitePackage.version} and form ${form.version} stay locked for this session.`}
        >
          <Icon name="lock" color={t.c.ink2} />
          <Text tone="ink2" style={s.lockedText}>
            <Mono
              size="body"
              tone="ink"
            >{`MAP ${sitePackage.version} · FORM ${form.version}`}</Mono>
            {" stay locked for this session"}
          </Text>
        </View>

        {openHere ? (
          <Note tone="waiting" icon="smartphone" title="An observation is still open here.">
            Start collection returns to it with every answer kept.
          </Note>
        ) : null}

        <View style={s.actions}>
          <Button
            label={inventory ? "Start the inventory round" : "Start collection"}
            icon={inventory ? "list" : "crosshair"}
            size="collector"
            fullWidth
            onPress={() => router.push("/collect")}
            disabled={blocked !== null}
            disabledReason={blocked ?? undefined}
            accessibilityHint={`${zone.label}, ${ROUNDS[roundType].label}.`}
            testID="brief-start"
          />
          <TextLink
            label="Read the offline field guide"
            icon="book-open"
            onPress={() => router.push("/account/field-guide")}
            style={s.guide}
          />
        </View>

        <Island eyebrow="This site collects" title={`${form.title} · ${form.version}`}>
          <View style={s.collects}>
            <Text tone="ink2">{form.summary}</Text>
            <Text variant="small" tone="ink2">
              {form.inclusion}
            </Text>
            {notes.length > 0 ? (
              <Note
                tone="waiting"
                title={`${notes.length} open protocol ${notes.length === 1 ? "decision" : "decisions"}.`}
                action={
                  <TextLink
                    label={notesOpen ? "Hide the list" : "Read them"}
                    onPress={() => setNotesOpen(!notesOpen)}
                  />
                }
              >
                These are unresolved in the source workbook. They are carried here so nothing ships
                as though it were settled.
              </Note>
            ) : null}
            {notesOpen ? (
              <View style={s.notes}>
                {notes.map((note) => (
                  <View key={note.id} style={s.noteItem}>
                    <Text variant="bodyStrong">{note.title}</Text>
                    <Text tone="ink2" selectable>
                      {note.detail}
                    </Text>
                    <Text variant="small" tone="ink2">
                      {note.source}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Island>
      </View>
    </Screen>
  );
}
