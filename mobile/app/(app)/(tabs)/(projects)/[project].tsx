import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useDataSource, useProject, useSites } from "../../../../src/features/preview";
import { AccountMark, PageIntro, PreviewData } from "../../../../src/features/projects/parts";
import {
  downloadsSummary,
  type SiteWithDownload,
  siteReadiness,
  siteSubtitle,
} from "../../../../src/features/projects/readiness";
import { SiteGlyphThumb, SitePlanThumb } from "../../../../src/features/projects/SitePlan";
import { hostedReadiness, siteVersionLine } from "../../../../src/features/projects/versions";
import { useHostedSites } from "../../../../src/packages/hosted/context";
import { siteVersionSnapshot } from "../../../../src/packages/zone-read-models";
import {
  Button,
  Island,
  ListRow,
  Screen,
  ScreenHeader,
  ScreenState,
  StateBadge,
  StatusLine,
  Text,
  type Theme,
  useStyles,
} from "../../../../src/ui";

function projectStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    list: { gap: t.space.s4 },
    footnote: { paddingHorizontal: t.space.s1 },
    downloads: { borderTopWidth: t.size.border, borderTopColor: t.c.rule, paddingTop: t.space.s3 },
  });
}

/** The sites whose packages draw the shared Riverside plan; others show a map glyph until drawn. */
const PLANNED_SITES = new Set(["riverside", "practice-garden"]);

/**
 * A project (Mobile 11): its sites, each with its download state as this device knows it, and the
 * total on the device at the foot. A site opens to its package (not downloaded, downloading or ready).
 * On device data a hosted site reads its maps from the verified catalog: the newest verified version
 * on this device, and a newer published one beside it (MOB-30). A project without sites says so.
 */
export default function ProjectScreen() {
  const s = useStyles(projectStyles);
  const params = useLocalSearchParams<{ project: string }>();
  const projectId = typeof params.project === "string" ? params.project : "";
  const project = useProject(projectId);
  const sites = useSites(projectId);

  const header = <ScreenHeader back showOnline avatar={<AccountMark />} />;

  if (!project)
    return (
      <Screen scroll dock testID="project-missing">
        {header}
        <ScreenState
          kind="no-access"
          title="This project is not on this device"
          body="You may have left it, or the link is outdated. Your records are not affected."
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

  return (
    <Screen
      scroll
      dock
      testID="project"
      footer={
        sites.length > 0 ? (
          <View style={s.downloads}>
            <StatusLine
              icon="smartphone"
              text="Downloads on this device"
              trailing={downloadsSummary(sites)}
            />
          </View>
        ) : undefined
      }
    >
      {header}
      <View style={s.body}>
        <View>
          <PageIntro
            eyebrow={`${project.org} · Project`}
            title={project.name}
            lead="Choose a site. Download state is verified on this device."
          />
          <PreviewData />
        </View>
        {sites.length === 0 ? (
          <ScreenState
            kind="empty"
            icon="layers"
            title="No sites yet"
            body="A site appears here once a project manager adds it on the web. When it has a map package, you can download it to this device."
          />
        ) : (
          <View style={s.list}>
            <Island padded={false}>
              {sites.map((site, index) => (
                <SiteRow key={site.id} site={site} projectId={project.id} first={index === 0} />
              ))}
            </Island>
            <View style={s.footnote}>
              <Text variant="small" tone="ink2">
                A site can be collected only after its map, zones, form and field guide are all on
                this device.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

function SiteRow({
  site,
  projectId,
  first,
}: {
  site: SiteWithDownload;
  projectId: string;
  first: boolean;
}) {
  const { mode } = useDataSource();
  const hostedSites = useHostedSites();
  // A hosted site's state and versions come from the verified catalog, not the site list's package.
  const versions =
    mode === "device" && !site.bundled ? siteVersionSnapshot(hostedSites, site.id) : null;
  const readiness = versions ? hostedReadiness(versions) : siteReadiness(site);
  const ready = versions ? versions.nextSessionPackageId !== null : site.download.state === "ready";
  const subtitle = versions ? siteVersionLine(site.zones.length, versions) : siteSubtitle(site);
  return (
    <ListRow
      divider={!first}
      title={site.name}
      subtitle={subtitle}
      status={<StateBadge kind="readiness" state={readiness.state} label={readiness.label} />}
      thumbnail={
        !ready ? (
          { icon: "layers" }
        ) : PLANNED_SITES.has(site.id) ? (
          <SitePlanThumb />
        ) : (
          <SiteGlyphThumb />
        )
      }
      onPress={() =>
        router.push({
          pathname: "/[project]/[site]",
          params: { project: projectId, site: site.id },
        })
      }
      accessibilityLabel={`${site.name}, ${subtitle}, ${readiness.label}`}
      testID={`project-site-${site.id}`}
    />
  );
}
