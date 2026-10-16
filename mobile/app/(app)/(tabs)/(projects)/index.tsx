import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useMe } from "../../../../src/data/api/me-provider";
import { ResumeUploadsNote } from "../../../../src/features/auth/ResumeUploadsNote";
import { PendingInvitationProjectsNote } from "../../../../src/features/onboarding/pending-invitation-note";
import {
  takeFreshInvitation,
  usePendingInvitation,
} from "../../../../src/features/onboarding/pending-invitation-store";
import {
  type PreviewProject,
  useDataSource,
  useProjects,
  useSites,
} from "../../../../src/features/preview";
import { AccountMark, PageIntro, PreviewData } from "../../../../src/features/projects/parts";
import { projectReadiness } from "../../../../src/features/projects/readiness";
import {
  ParkedDrafts,
  UnfinishedCard,
  useUnfinished,
} from "../../../../src/features/projects/UnfinishedCard";
import { hasUpdate, updatesPhrase } from "../../../../src/features/projects/versions";
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
  Text,
  type Theme,
  useStyles,
} from "../../../../src/ui";

function homeStyles(t: Theme) {
  return StyleSheet.create({
    body: { gap: t.space.s6 },
    list: { gap: t.space.s4 },
    footnote: { paddingHorizontal: t.space.s1 },
  });
}

/**
 * Projects (Mobile 10), the collector's home: the joined projects with what is ready offline, the
 * unfinished observation to pick up again, and "+ Join" for a code from a coordinator.
 *
 * On device data the projects are the account's memberships from `/v1/me` (cached for offline starts),
 * and readiness comes from the packages really on this phone; the unfinished card is the field
 * session's recovered draft or open observation. Preview data shows the designed Play Study and
 * Training, and the sample draft.
 */
export default function ProjectsHome() {
  const s = useStyles(homeStyles);
  const projects = useProjects();
  const unfinished = useUnfinished();
  const { mode } = useDataSource();
  const me = useMe();
  const loading = mode === "device" && !me.ready && projects.length === 0;

  // An invitation link opened while this account is signed in opens the join screen with its code,
  // once; a code that waited through sign-in stays on the note below until it is used or forgotten.
  const { code: waiting } = usePendingInvitation();
  useEffect(() => {
    if (!waiting) return;
    const fresh = takeFreshInvitation();
    if (fresh) router.push({ pathname: "/join-project", params: { code: fresh } });
  }, [waiting]);

  return (
    <Screen scroll dock testID="projects-home">
      <ScreenHeader showOnline avatar={<AccountMark />} />
      <View style={s.body}>
        <View>
          <PageIntro
            title="Projects"
            lead="Research spaces you have joined."
            trailing={
              <Button
                variant="outline"
                label="Join"
                icon="plus"
                onPress={() => router.push("/join-project")}
                accessibilityHint="Opens the join code screen. Nothing is joined until you confirm."
                testID="projects-join"
              />
            }
          />
          <PreviewData />
        </View>
        <ResumeUploadsNote />
        <PendingInvitationProjectsNote />
        {unfinished ? <UnfinishedCard unfinished={unfinished} /> : null}
        <ParkedDrafts />
        {loading ? (
          <ScreenState kind="loading" body="Reading your projects…" />
        ) : projects.length === 0 ? (
          <ScreenState
            kind="empty"
            icon="folder"
            title="No projects yet"
            body={
              me.error
                ? "Your projects could not be read from DECA Mark. Join with a code from your coordinator, or try again when you have signal."
                : "Join with the eight-character code from your coordinator."
            }
            action={
              <Button
                variant="ink"
                label="Join a project"
                iconRight="arrow-right"
                onPress={() => router.push("/join-project")}
              />
            }
          />
        ) : (
          <View style={s.list}>
            <Island padded={false}>
              {projects.map((project, index) => (
                <ProjectRow key={project.id} project={project} first={index === 0} />
              ))}
            </Island>
            <View style={s.footnote}>
              <Text variant="small" tone="ink2">
                Download each site before going into the field. This list does not imply scheduled
                assignments.
              </Text>
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

function ProjectRow({ project, first }: { project: PreviewProject; first: boolean }) {
  const listed = useSites(project.id);
  const { mode } = useDataSource();
  const hosted = useHostedSites();
  // Hosted sites are ready while a verified map is on this device, even after a newer one is
  // published; the row also counts the sites with a newer map to download (MUI-10).
  const catalog = listed.map((site) =>
    mode === "device" && !site.bundled ? siteVersionSnapshot(hosted, site.id) : null,
  );
  const sites = listed.map((site, index) => {
    const versions = catalog[index];
    return versions?.nextSessionPackageId
      ? { ...site, download: { ...site.download, state: "ready" as const } }
      : site;
  });
  const updates = catalog.filter((versions) => versions !== null && hasUpdate(versions)).length;
  const base = projectReadiness(project, sites);
  const readiness = { ...base, label: `${base.label}${updatesPhrase(updates)}` };
  return (
    <ListRow
      divider={!first}
      title={project.name}
      subtitle={project.summary}
      status={<StateBadge kind="readiness" state={readiness.state} label={readiness.label} />}
      onPress={() => router.push({ pathname: "/[project]", params: { project: project.id } })}
      accessibilityLabel={`${project.name}, ${project.summary}, ${readiness.label}`}
      testID={`projects-row-${project.id}`}
    />
  );
}
