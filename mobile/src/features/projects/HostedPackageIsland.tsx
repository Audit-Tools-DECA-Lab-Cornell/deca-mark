import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useSiteVersions } from "../../packages/zone-read-models";
import {
  announce,
  Button,
  Island,
  Note,
  ProgressBar,
  StateBadge,
  Text,
  TextLink,
  type Theme,
  useStyles,
} from "../../ui";
import { sizeLabel } from "./recovery";
import { checkedLine, referencesSentence, versionView } from "./versions";

function islandStyles(t: Theme) {
  return StyleSheet.create({
    island: { gap: t.space.s4 },
    rows: { borderBottomWidth: t.size.border, borderBottomColor: t.c.rule },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      columnGap: t.space.s3,
      rowGap: t.space.s1,
      minHeight: t.size.touch,
      paddingVertical: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
    older: {
      gap: t.space.s2,
      paddingVertical: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
    actions: { gap: t.space.s4, alignItems: "stretch", marginTop: t.space.s2 },
    link: { alignSelf: "center" },
  });
}

/**
 * A hosted site's maps on this device (UI plan 4.2, MUI-6 and MUI-10): the newest verified version,
 * which the next session opens; a newer published one, downloaded beside it; each download part by
 * part; what failed and what stays ready; older versions with what still uses them; and the last check.
 * Removal is offered only when nothing uses a version, and the data layer checks again before removing.
 */
export function HostedPackageIsland({
  siteId,
  siteName,
  opening,
  problem,
  onSetUp,
}: {
  readonly siteId: string;
  readonly siteName: string;
  readonly opening: boolean;
  readonly problem: string | null;
  /** Opens the newest verified map on this device in the field session. */
  readonly onSetUp: (packageId: string) => void;
}) {
  const s = useStyles(islandStyles);
  const versions = useSiteVersions(siteId);
  const [removal, setRemoval] = useState<string | null>(null);
  const view = versionView(versions);
  const newest = view.newest;
  const title = newest
    ? `Map package v${newest.version}`
    : versions.available
      ? `Map package v${versions.available.version}`
      : "Map package";
  const meta = newest ? (
    <StateBadge kind="readiness" state="readyOffline" />
  ) : view.progress ? (
    <StateBadge kind="readiness" state="downloading" />
  ) : (
    <StateBadge kind="readiness" state="notDownloaded" />
  );
  const description = newest
    ? `${sizeLabel(newest.bytes)} on this device · checked against the server's digest`
    : versions.available
      ? `${sizeLabel(versions.available.archiveBytes)} · needs a connection`
      : "No map package yet";

  function download(packageId: string, label: string) {
    announce(`Downloading ${label}.`);
    void versions.downloadPackage(packageId);
  }

  function remove(row: { packageId: string; version: number }) {
    Alert.alert(
      `Remove ${siteName} map v${row.version} from this device?`,
      "Saved observations stay on this device and still upload. You can download this map again with a connection.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove map",
          style: "destructive",
          onPress: () => {
            void versions.remove(row.packageId).then((result) => {
              if (result.removed) {
                setRemoval(null);
                announce(`Map v${row.version} removed from this device.`);
                return;
              }
              const reason = `Map v${row.version} was not removed: something on this device still uses it.`;
              setRemoval(reason);
              announce(reason);
            });
          },
        },
      ],
    );
  }

  const checked = checkedLine(versions);
  return (
    <Island title={title} meta={meta} description={description}>
      <View style={s.island}>
        {view.update ? (
          <Note tone="waiting" title="A newer map is available.">
            {view.update.note}
          </Note>
        ) : null}
        {view.progress ? (
          <>
            <ProgressBar
              value={view.progress.part}
              max={view.progress.parts.length}
              label={`Map v${view.progress.version ?? ""} download`}
              detail={view.progress.detail}
            />
            <View style={s.rows}>
              {view.progress.parts.map((part) => (
                <View
                  key={part.label}
                  style={s.row}
                  accessible
                  accessibilityLabel={`${part.label}, ${part.state}`}
                >
                  <Text>{part.label}</Text>
                  <StateBadge kind="readiness" state={part.state} size="sm" />
                </View>
              ))}
            </View>
          </>
        ) : null}
        {view.failure ? (
          <Note tone="attention" title={view.failure.title} live="assertive">
            {view.failure.body}
          </Note>
        ) : null}
        {view.refresh ? <Note tone="neutral">{view.refresh}</Note> : null}
        {versions.referencesProblem ? (
          <Note tone="neutral">{versions.referencesProblem}</Note>
        ) : null}
        {problem ? (
          <Note tone="attention" title="The session was not set up." live="assertive">
            {problem}
          </Note>
        ) : null}
        {removal ? (
          <Note tone="attention" live="assertive">
            {removal}
          </Note>
        ) : null}

        <View style={s.actions}>
          {view.first ? (
            <Button
              label={view.first.button}
              icon="download"
              fullWidth
              onPress={() => download(view.first?.packageId ?? "", siteName)}
              testID="site-download"
            />
          ) : (
            <Button
              label="Set up this session"
              iconRight={opening ? undefined : "arrow-right"}
              fullWidth
              busy={opening}
              busyLabel="Opening the package…"
              disabled={versions.nextSessionPackageId === null}
              disabledReason={
                view.progress
                  ? "Turns on once all four parts are verified."
                  : "Turns on once a map is verified on this device."
              }
              onPress={() => {
                if (versions.nextSessionPackageId) onSetUp(versions.nextSessionPackageId);
              }}
              testID="site-set-up"
            />
          )}
          {view.update ? (
            <Button
              variant="outline"
              label={view.update.button}
              icon="download"
              fullWidth
              onPress={() =>
                download(view.update?.packageId ?? "", `map v${versions.available?.version ?? ""}`)
              }
              testID="site-download-update"
            />
          ) : null}
          {view.redownload.map((entry) => (
            <Button
              key={entry.packageId}
              variant="outline"
              label={entry.button}
              icon="download"
              fullWidth
              onPress={() => download(entry.packageId, entry.button)}
            />
          ))}
          {view.progress ? (
            <TextLink
              label="Cancel download"
              tone="ink"
              onPress={() => {
                versions.cancelDownload(versions.download?.packageId ?? "");
                announce("Download cancelled. The maps already on this device stay ready.");
              }}
              style={s.link}
            />
          ) : null}
          {newest ? (
            <RemoveLink
              version={newest.version}
              usedBy={referencesSentence(newest.references)}
              onRemove={() => remove(newest)}
            />
          ) : null}
        </View>

        {view.older.length > 0 ? (
          <View>
            <Text variant="bodyStrong">Older maps on this device</Text>
            {view.older.map((row) => (
              <View key={row.packageId} style={s.older}>
                <Text>{row.label}</Text>
                <RemoveLink
                  version={row.version}
                  usedBy={row.usedBy}
                  onRemove={() => remove(row)}
                />
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.actions}>
          {checked ? (
            <Text variant="small" tone="ink2" align="center">
              {checked}
            </Text>
          ) : null}
          <TextLink
            label="Check for updates"
            icon="refresh-cw"
            onPress={() => {
              announce("Checking for map updates.");
              void versions.refresh();
            }}
            style={s.link}
          />
        </View>
      </View>
    </Island>
  );
}

/** "Remove map v1", off with what still uses it; the data layer checks again before removing. */
function RemoveLink({
  version,
  usedBy,
  onRemove,
}: {
  readonly version: number;
  /** What still uses this map, or null when nothing does. */
  readonly usedBy: string | null;
  readonly onRemove: () => void;
}) {
  return (
    <Button
      variant="outline"
      label={`Remove map v${version}`}
      icon="trash-2"
      disabled={usedBy !== null}
      disabledReason={usedBy ?? undefined}
      onPress={onRemove}
    />
  );
}
