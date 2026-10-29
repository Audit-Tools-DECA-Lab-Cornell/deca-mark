import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { practiceLine } from "../../../../src/features/account/leaving";
import { ResumeUploadsNote } from "../../../../src/features/auth/ResumeUploadsNote";
import { ObservationRow } from "../../../../src/features/observations/ObservationRow";
import {
  attentionNote,
  filterAnnouncement,
  inZone,
  summaryLine,
  zonesOf,
} from "../../../../src/features/observations/rows";
import { ZoneChips } from "../../../../src/features/observations/ZoneChips";
import { useQueue } from "../../../../src/features/preview/data-source";
import { AccountMark, PageIntro, PreviewData } from "../../../../src/features/projects/parts";
import { useSync } from "../../../../src/sync/provider";
import {
  announce,
  Button,
  dockClearance,
  Note,
  Screen,
  ScreenHeader,
  ScreenState,
  Text,
  type Theme,
  useOnline,
  useStyles,
  useTheme,
} from "../../../../src/ui";

function observationsStyles(t: Theme) {
  return StyleSheet.create({
    // The list pads its own bottom, so rows scroll under the floating dock instead of stopping above it.
    screen: { paddingBottom: 0 },
    head: { gap: t.space.s6, marginBottom: t.space.s6 },
    separator: { height: t.space.s4 },
    footer: { gap: t.space.s2, paddingTop: t.space.s6, paddingHorizontal: t.space.s1 },
  });
}

/** How long the pull-to-refresh spinner stays: `wake()` starts the uploader and reports nothing back. */
const PULL_MS = 700;

/**
 * Observations (MOB-38): every record on this device, one list inside the tab stack so the dock stays.
 * Each record says where it is in the contract's words (On device, Uploading, Uploaded, Needs attention),
 * as one stop for a screen reader. Records the server turned away say why and can be sent again as they
 * are; a pull calls the real `wake()`. Practice records are listed too and say they never upload.
 *
 * Words come from the queue (`features/preview/queue.ts`), which maps what the device stores to the five
 * states: "Uploaded" only for a record with a validated receipt. On a device nothing marks a record as
 * being sent, so a record reads On device until its receipt arrives; "Uploading" is drawn when the queue
 * says it, as in sample data.
 */
export default function ObservationsScreen() {
  const s = useStyles(observationsStyles);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const queue = useQueue();
  const { retry: retryUploads, error: syncError } = useSync();
  const online = useOnline();
  const [zone, chooseZone] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const { records, counts, uploadNow } = queue;
  const zones = useMemo(() => zonesOf(records), [records]);
  // A zone that no record is in any more (another account's records, say) is no filter at all.
  const chosen = zone !== null && zones.includes(zone) ? zone : null;
  const shown = useMemo(() => inZone(records, chosen), [records, chosen]);
  const attention = counts.attention;
  const summary = summaryLine(queue);
  const practice = practiceLine(queue.practice);

  const pick = useCallback(
    (next: string | null) => {
      chooseZone(next);
      announce(filterAnnouncement(next, inZone(records, next).length, records.length));
    },
    [records],
  );

  const pull = useCallback(() => {
    uploadNow();
    setRefreshing(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) setRefreshing(false);
    }, PULL_MS);
  }, [uploadNow]);

  async function retryAll() {
    if (retrying) return;
    setRetrying(true);
    setRetryFailed(false);
    announce("Retrying. The same records are sent again and none is changed.");
    try {
      await retryUploads();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (mounted.current) setRetryFailed(true);
    } finally {
      if (mounted.current) setRetrying(false);
    }
  }

  const note = attention > 0 ? attentionNote(attention) : null;
  const head = (
    <View>
      <ScreenHeader showOnline avatar={<AccountMark />} />
      <View style={s.head}>
        <View>
          <PageIntro title="Observations" lead={summary ?? undefined} />
          <PreviewData>
            Sample observations. Nothing here is read from this device or sent to DECA Mark.
          </PreviewData>
        </View>
        <ResumeUploadsNote />
        {online === false ? <ScreenState kind="offline" testID="observations-offline" /> : null}
        {queue.error !== null ? (
          <Note
            tone="attention"
            title="The records on this device could not be read."
            action={
              <Button variant="ink" label="Try again" icon="rotate-cw" onPress={queue.retry} />
            }
            testID="observations-unread"
          >
            They are still on this device; nothing was removed.
          </Note>
        ) : null}
        {syncError !== "" ? (
          <Note
            tone="waiting"
            title="Uploading is waiting."
            live="polite"
            testID="observations-sync"
          >
            {syncError}
          </Note>
        ) : null}
        {note ? (
          <Note
            tone="attention"
            title={note.title}
            action={
              <Button
                variant="ink"
                label="Retry these uploads"
                icon="rotate-cw"
                busy={retrying}
                busyLabel="Retrying uploads…"
                onPress={() => void retryAll()}
                testID="observations-retry"
              />
            }
            testID="observations-attention"
          >
            {note.body}
          </Note>
        ) : null}
        {retryFailed ? (
          <Note tone="attention" title="Retry did not start." testID="observations-retry-failed">
            The records are still on this device and nothing was changed. Try again.
          </Note>
        ) : null}
        {zones.length > 1 ? <ZoneChips zones={zones} value={chosen} onChange={pick} /> : null}
      </View>
    </View>
  );

  const empty = queue.loading ? (
    <ScreenState kind="loading" />
  ) : queue.error !== null ? null : (
    <ScreenState
      kind="empty"
      action={
        <Button
          variant="ink"
          label="Go to projects"
          iconRight="arrow-right"
          onPress={() => router.navigate("/")}
        />
      }
    />
  );

  const foot =
    records.length > 0 ? (
      <View style={s.footer}>
        <Text variant="small" tone="ink2">
          Records upload by themselves while the app is open and online. Closing the app pauses
          uploads until it opens again.
        </Text>
        {practice ? (
          <Text variant="small" tone="ink2">
            {practice}
          </Text>
        ) : null}
      </View>
    ) : null;

  return (
    <Screen dock contentStyle={s.screen} testID="observations-home">
      <FlatList
        testID="observations-list"
        data={shown}
        keyExtractor={(record) => record.id}
        renderItem={({ item }) => <ObservationRow record={item} />}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={head}
        ListEmptyComponent={empty}
        ListFooterComponent={foot}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={pull}
            tintColor={t.c.ink2}
            colors={[t.c.ink]}
            progressBackgroundColor={t.c.island}
          />
        }
        contentContainerStyle={{ paddingBottom: dockClearance(t, insets.bottom) + t.space.s6 }}
        initialNumToRender={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

function Separator() {
  const s = useStyles(observationsStyles);
  return <View style={s.separator} />;
}
