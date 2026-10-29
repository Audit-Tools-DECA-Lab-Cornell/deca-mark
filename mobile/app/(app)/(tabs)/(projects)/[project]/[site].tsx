import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  type AssetState,
  useDataSource,
  useProject,
  useSite,
} from "../../../../../src/features/preview";
import { HostedPackageIsland } from "../../../../../src/features/projects/HostedPackageIsland";
import { PageIntro, PreviewData } from "../../../../../src/features/projects/parts";
import {
  type AssetCheck,
  allVerified,
  deviceAssetChecks,
  type SiteWithDownload,
  zonesSentence,
} from "../../../../../src/features/projects/readiness";
import { SitePlanFrame } from "../../../../../src/features/projects/SitePlan";
import { UnreadableDraftCard } from "../../../../../src/features/projects/UnfinishedCard";
import { bundledPackage } from "../../../../../src/packages/bundled";
import { packageFacts } from "../../../../../src/packages/open";
import { useSiteVersions } from "../../../../../src/packages/zone-read-models";
import { useFieldSession } from "../../../../../src/session/provider";
import {
  announce,
  Button,
  Icon,
  InnerPanel,
  Island,
  Note,
  ProgressBar,
  Screen,
  ScreenHeader,
  ScreenState,
  StateBadge,
  Text,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
  useTheme,
} from "../../../../../src/ui";

/** The sites drawn from the shared Riverside plan. */
const PLANNED_SITES = new Set(["riverside", "practice-garden"]);

const ASSET_STATE: Record<AssetState, "verified" | "downloading" | "waiting"> = {
  verified: "verified",
  downloading: "downloading",
  waiting: "waiting",
};

function siteStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    slot: { alignItems: "center", justifyContent: "center", gap: t.space.s3, minHeight: 180 },
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
    rowLabel: { flexShrink: 1 },
    actions: { gap: t.space.s4, alignItems: "stretch", marginTop: t.space.s2 },
    link: { alignSelf: "center" },
  });
}

/**
 * A site (Mobile 12 and 13): its map package, and whether everything collection needs is on this
 * device. Not downloaded, downloading (progress, each part Waiting → Downloading → Verified) or ready
 * offline. "Set up this session" turns on once all four parts verify, opens the package in the field
 * session, and continues to "Before you begin".
 *
 * On device data a site is ready only when its package is on this phone, shipped with the app or
 * downloaded from the DECA Mark API (MOB-14), and the four parts are checked against that package. A
 * hosted download is checked against the digest the server recorded before anything is kept. Preview
 * data simulates the designed download and removal.
 */
export default function SiteScreen() {
  const s = useStyles(siteStyles);
  const t = useTheme();
  const params = useLocalSearchParams<{ project: string; site: string }>();
  const projectId = typeof params.project === "string" ? params.project : "";
  const siteId = typeof params.site === "string" ? params.site : "";
  const project = useProject(projectId);
  const site = useSite(siteId);
  const data = useDataSource();
  const session = useFieldSession();
  const haptics = useHaptics();
  const [opening, setOpening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const versions = useSiteVersions(siteId);

  const state = site?.download.state;
  const previous = useRef(state);
  useEffect(() => {
    if (site && previous.current === "downloading" && state === "ready") {
      haptics.success();
      announce(`${site.name} is ready offline.`);
    }
    previous.current = state;
  }, [state, site, haptics]);

  // Read from the device once per package and state, rather than on every render.
  const packageId = site?.packageId ?? "";
  const facts = useMemo(
    () => (data.mode === "device" && state === "ready" ? packageFacts(packageId) : null),
    [data.mode, packageId, state],
  );

  const header = <ScreenHeader back showOnline />;

  if (!project || !site || !project.siteIds.includes(site.id))
    return (
      <Screen scroll dock testID="site-missing">
        {header}
        <ScreenState
          kind="no-access"
          action={
            <Button
              variant="outline"
              icon="arrow-left"
              label="Back to projects"
              onPress={() => router.navigate("/")}
            />
          }
        />
      </Screen>
    );

  const device = data.mode === "device";
  const assets: AssetCheck[] = device
    ? deviceAssetChecks(site.download.state === "ready" ? facts : null)
    : site.download.assets;
  const ready = site.download.state === "ready" && allVerified(assets);

  // A hosted site opens the newest verified map on this device, which may be older than the one
  // published (MUI-1): the site list's current package is not the session's.
  const hosted = device && !site.bundled;
  // On this device: for a hosted site, any verified map (the catalog's), not only the published one.
  const onDevice = hosted
    ? versions.nextSessionPackageId !== null
    : site.download.state === "ready";

  async function setUp(packageId: string = site?.packageId ?? "") {
    if (!site || !project || opening) return;
    setOpening(true);
    setProblem(null);
    try {
      const outcome = await session.openPackage(packageId);
      if (!outcome.ok) {
        haptics.warning();
        setProblem(outcome.reason);
        announce(outcome.reason);
        return;
      }
      router.push({
        pathname: "/[project]/[site]/brief",
        params: { project: project.id, site: site.id },
      });
    } finally {
      setOpening(false);
    }
  }

  function remove() {
    if (!site) return;
    Alert.alert(
      `Remove ${site.name} from this device?`,
      "The map package is removed. Records already saved stay on this device and still upload. You can download the site again with a connection.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Remove download",
          style: "destructive",
          onPress: () => {
            data.removeDownload(site.id);
            announce(`${site.name} removed from this device.`);
          },
        },
      ],
    );
  }

  return (
    <Screen scroll dock testID={`site-${site.id}`}>
      {header}
      <View style={s.body}>
        <View>
          <PageIntro
            eyebrow={`${project.name} · Site`}
            title={site.name}
            lead={
              onDevice
                ? zonesSentence(site.zones)
                : "Download once. Verify here. Collect without signal."
            }
          />
          <PreviewData>Sample download. Nothing is fetched from the DECA Mark server.</PreviewData>
        </View>

        {onDevice && PLANNED_SITES.has(site.id) ? (
          <SitePlanFrame siteName={site.name} version={site.packageVersion} />
        ) : (
          <InnerPanel dashed={!onDevice} style={s.slot}>
            <Icon name={onDevice ? "map-pinned" : "layers"} size={28} color={t.c.ink2} />
            <Text variant="small" tone="ink2" align="center">
              {onDevice
                ? "The map opens on the collect screen."
                : "The map appears here once the package is on this device."}
            </Text>
          </InnerPanel>
        )}

        <UnreadableDraftCard />

        {hosted ? (
          <HostedPackageIsland
            siteId={site.id}
            siteName={site.name}
            opening={opening}
            problem={problem}
            onSetUp={(packageId) => void setUp(packageId)}
          />
        ) : (
          <PackageIsland
            site={site}
            assets={assets}
            ready={ready}
            device={device}
            canDownload={data.canDownload}
            opening={opening}
            problem={problem}
            onDownload={() => {
              data.startDownload(site.id);
              announce(`Downloading ${site.name}.`);
            }}
            onCancel={() => {
              data.cancelDownload(site.id);
              announce("Download cancelled. Nothing was kept.");
            }}
            onSetUp={() => void setUp()}
            onRemove={remove}
          />
        )}
      </View>
    </Screen>
  );
}

function PackageIsland({
  site,
  assets,
  ready,
  device,
  canDownload,
  opening,
  problem,
  onDownload,
  onCancel,
  onSetUp,
  onRemove,
}: {
  site: SiteWithDownload;
  assets: readonly AssetCheck[];
  ready: boolean;
  device: boolean;
  canDownload: boolean;
  opening: boolean;
  problem: string | null;
  onDownload: () => void;
  onCancel: () => void;
  onSetUp: () => void;
  onRemove: () => void;
}) {
  const s = useStyles(siteStyles);
  const { download } = site;
  const title = `Map package ${site.packageVersion}`;
  const found = device ? bundledPackage(site.packageId) : undefined;

  const meta =
    download.state === "ready" ? (
      <StateBadge kind="readiness" state="readyOffline" />
    ) : download.state === "downloading" ? (
      <StateBadge kind="readiness" state="downloading" />
    ) : (
      <StateBadge kind="readiness" state="notDownloaded" />
    );

  const hasPackage = !device || site.bundled || site.packageId !== "";
  const description =
    download.state === "ready"
      ? device && site.bundled
        ? `${found?.sizeOnDevice ?? "On this device"} · checked on this device`
        : `${site.sizeMb} MB on this device · ${site.verifiedLabel}`
      : download.state === "notDownloaded"
        ? hasPackage
          ? `${site.sizeMb} MB · needs a connection`
          : "No map package yet"
        : undefined;

  return (
    <Island title={title} meta={meta} description={description}>
      <View style={s.island}>
        {download.state === "downloading" ? (
          <ProgressBar
            value={download.receivedMb}
            max={download.totalMb}
            label={`${title} download`}
            detail={download.detail ?? `${download.receivedMb} of ${download.totalMb} MB`}
          />
        ) : null}
        <View style={s.rows}>
          {assets.map((asset) => (
            <View
              key={asset.label}
              style={s.row}
              accessible
              accessibilityLabel={`${asset.label}, ${assetWord(asset.state)}`}
            >
              <Text style={s.rowLabel}>{asset.label}</Text>
              <StateBadge kind="readiness" state={ASSET_STATE[asset.state]} size="sm" />
            </View>
          ))}
        </View>
        {download.problem ? (
          <Note tone="attention" title="The download did not finish." live="assertive">
            {`${download.problem} Nothing was kept; you can try again.`}
          </Note>
        ) : null}
        {problem ? (
          <Note tone="attention" title="The session was not set up." live="assertive">
            {problem}
          </Note>
        ) : null}
        <View style={s.actions}>
          {download.state === "notDownloaded" ? (
            <Button
              label={canDownload && hasPackage ? `Download ${site.sizeMb} MB` : "Download"}
              icon="download"
              fullWidth
              disabled={!canDownload || !hasPackage}
              disabledReason={
                hasPackage
                  ? "Sign in with a connection to download this site."
                  : "This site has no map package yet. A project manager uploads one on the web."
              }
              onPress={onDownload}
              testID="site-download"
            />
          ) : (
            <Button
              label="Set up this session"
              iconRight={opening ? undefined : "arrow-right"}
              fullWidth
              busy={opening}
              busyLabel="Opening the package…"
              disabled={!ready}
              disabledReason={
                download.state === "downloading"
                  ? "Turns on once all four parts are verified."
                  : "Turns on once all four parts are verified on this device."
              }
              onPress={onSetUp}
              testID="site-set-up"
            />
          )}
          {download.state === "downloading" ? (
            <TextLink label="Cancel download" tone="ink" onPress={onCancel} style={s.link} />
          ) : download.state === "ready" && !site.bundled ? (
            <TextLink
              label="Remove this download"
              tone="ink"
              onPress={onRemove}
              accessibilityHint="Asks before removing the package."
              style={s.link}
            />
          ) : download.state === "ready" ? (
            <Text variant="small" tone="ink2" align="center">
              This package ships with the app, so it stays on this device.
            </Text>
          ) : null}
        </View>
      </View>
    </Island>
  );
}

function assetWord(state: AssetState): string {
  return state === "verified" ? "Verified" : state === "downloading" ? "Downloading" : "Waiting";
}
