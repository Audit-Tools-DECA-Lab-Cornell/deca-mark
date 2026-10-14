import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { SiteVersions } from "../zone-model-types";
import { readSiteCheckedAt, readSiteList, writeSiteList } from "./device";
import { discoveryProblem } from "./discovery-state";
import type { PackageOperations } from "./operations";
import type { HostedSite } from "./schemas";

export function useSiteDiscovery(input: {
  readonly owner: string | null;
  readonly issuer: string | null;
  readonly userId: string | null;
  readonly projects: readonly string[];
  readonly operations: PackageOperations | null;
  readonly online: boolean;
}) {
  const { owner: requestedOwner, issuer, userId, projects, operations, online } = input;
  const [owner, setOwner] = useState(requestedOwner);
  const [sites, setSites] = useState<Record<string, readonly HostedSite[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, string | null>>({});
  const [problems, setProblems] = useState<Record<string, SiteVersions["refreshProblem"]>>({});
  useEffect(() => {
    setOwner(requestedOwner);
    setErrors({});
    setProblems({});
    setSites(
      issuer && userId
        ? Object.fromEntries(
            projects.map((project) => [project, readSiteList(issuer, userId, project) ?? []]),
          )
        : {},
    );
    setChecked(
      issuer && userId
        ? Object.fromEntries(
            projects.map((project) => [project, readSiteCheckedAt(issuer, userId, project)]),
          )
        : {},
    );
  }, [requestedOwner, issuer, userId, projects]);
  const refresh = useCallback(
    async (project: string) => {
      if (!operations || !issuer || !userId) return;
      try {
        const list = await operations.refresh(project, []);
        if (!list || !operations.runtime.current()) return;
        const checkedAt = new Date().toISOString();
        writeSiteList(issuer, userId, project, list, checkedAt);
        setSites((value) => ({ ...value, [project]: list }));
        setChecked((value) => ({ ...value, [project]: checkedAt }));
        setProblems((value) => ({ ...value, [project]: null }));
        setErrors(({ [project]: _old, ...rest }) => rest);
      } catch (error) {
        if (operations.runtime.current()) {
          setProblems((value) => ({ ...value, [project]: discoveryProblem(error) }));
          setErrors((value) => ({
            ...value,
            [project]: error instanceof Error ? error.message : "Map updates could not be checked.",
          }));
        }
      }
    },
    [issuer, userId, operations],
  );
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!online) return;
    const all = () => {
      for (const project of projects) void refreshRef.current(project);
    };
    all();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") all();
    });
    return () => listener.remove();
  }, [online, projects]);
  const visible = owner === requestedOwner;
  return {
    sites: visible ? sites : {},
    errors: visible ? errors : {},
    checked: visible ? checked : {},
    problems: visible ? problems : {},
    refresh,
    setErrors,
  };
}
