/**
 * Review switches for the collector: the sign-in gate, the data source and the screen theme.
 *
 * Development and review builds only — the (dev) layout sends a release build back to the start. Open it
 * from the gallery, or with the deep link decamark://states. Every switch is stored on this device
 * (`fm.dev.gate`, `fm.dev.dataSource`, the screen preference) and none of them reaches the server.
 */
import { router, useNavigation } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useAccount } from "../../src/auth/provider";
import { useMe } from "../../src/data/api/me-provider";
import { type GateOverride, type GateRoute, useGate } from "../../src/features/auth/gate";
import { useProfile } from "../../src/features/auth/profile-store";
import { type DataMode, useDataSource } from "../../src/features/preview/data-source";
import {
  announce,
  Button,
  type Fact,
  FactsList,
  Island,
  Note,
  type RadioOption,
  RadioRows,
  type Scheme,
  Screen,
  ScreenHeader,
  Segmented,
  type SegmentedOption,
  Text,
  type Theme,
  usePreferences,
  useStyles,
} from "../../src/ui";

const GATE_OPTIONS: readonly RadioOption<GateOverride>[] = [
  {
    value: "real",
    label: "Real",
    description:
      "Follows the account, its server profile (/v1/me) and the observer profile on this device.",
  },
  {
    value: "signed-out",
    label: "Signed out",
    description: "Opens sign-in, as after a deliberate sign-out.",
  },
  {
    value: "deleted",
    label: "Deleted account",
    description:
      "Opens welcome as after the server reported this account deleted: its records stay on this device and cannot upload.",
  },
  {
    value: "onboarding",
    label: "Onboarding",
    description:
      "Opens the observer identity and join steps, even with a finished profile. Finishing them switches this to Signed in.",
  },
  {
    value: "signed-in",
    label: "Signed in",
    description: "Opens the app, even without a session or a profile.",
  },
];

const DATA_OPTIONS: readonly SegmentedOption<DataMode>[] = [
  { value: "device", label: "Device" },
  { value: "preview", label: "Preview" },
];

const DATA_NOTES: Record<DataMode, string> = {
  device:
    "Screens read the account and this phone: projects and the profile from /v1/me, join codes and profile edits through the DECA Mark API, and the SQLite queue, sync and the packages downloaded to this phone. Without a session or a connection, they say so.",
  preview:
    "Screens show the designed fixtures, including states the device cannot produce yet, such as Uploading or a download in progress. The join code DECA2026 opens the Play Study invitation. Nothing is sent to the server.",
};

const SCREEN_OPTIONS: readonly SegmentedOption<Scheme>[] = [
  { value: "day", label: "Day" },
  { value: "dusk", label: "Dusk" },
];

const ROUTE_WORDS: Record<GateRoute, string> = {
  auth: "Sign-in",
  onboarding: "Onboarding",
  app: "The app",
  hold: "The splash, until /v1/me is read",
};

type RootNavigation = {
  getState(): { routeNames?: readonly string[] } | undefined;
  reset(state: { index: number; routes: { name: string }[] }): void;
};

export default function StatesScreen() {
  const s = useStyles(makeStyles);
  const gate = useGate();
  const profile = useProfile();
  const { session, account, accountDeleted } = useAccount();
  const me = useMe();
  const data = useDataSource();
  const preferences = usePreferences();
  const root = useNavigation("/") as unknown as RootNavigation | undefined;
  const [status, setStatus] = useState("");

  function say(words: string) {
    setStatus(words);
    announce(words);
  }

  /** Leaves the review screens for the first route the gate now opens. */
  function openGate() {
    const start = root?.getState()?.routeNames?.find((name) => name !== "(dev)");
    if (root && start) root.reset({ index: 0, routes: [{ name: start }] });
    else say("Nothing to open: the gate's routes are not built yet.");
  }

  const profileWords = profile.saved
    ? [
        profile.initials,
        profile.complete ? "onboarding finished" : "onboarding not finished",
        ...(profile.pending ? ["not yet on the account"] : []),
      ].join(" · ")
    : "Not saved";
  const serverWords = me.profile?.observer_initials
    ? `${me.profile.observer_initials} · ${me.profile.display_name ?? "no name"}`
    : me.profile
      ? "No initials yet"
      : me.ready
        ? "Not read"
        : "Reading…";
  const accountWords = account
    ? `${account.email ?? account.id}${accountDeleted ? " · deleted on the server" : ""}`
    : "None";

  const facts: Fact[] = [
    { label: "Session", value: session ? "Live" : "None" },
    { label: "Account on this device", value: accountWords },
    { label: "Server profile", value: serverWords },
    { label: "Observer profile on this device", value: profileWords },
    { label: "The account alone opens", value: ROUTE_WORDS[gate.real.route] },
    { label: "Showing now", value: ROUTE_WORDS[gate.route] },
  ];

  return (
    <Screen scroll testID="dev-states">
      <ScreenHeader
        back={() => (router.canGoBack() ? router.back() : router.replace("/gallery"))}
      />
      <View style={s.intro}>
        <Text variant="monoLabel" tone="ink2">
          Contour · collector · dev only
        </Text>
        <Text variant="display" header>
          States
        </Text>
        <Text variant="body" tone="ink2">
          Switches for reviewing the collector on this device. Release builds ignore them, and
          nothing here reaches the server.
        </Text>
      </View>

      <View style={s.content}>
        <Island
          title="Sign-in gate"
          description="Which part of the app opens. The root layout guards sign-in, onboarding and the app with this."
        >
          <View style={s.stack}>
            <RadioRows
              label="Sign-in gate"
              options={GATE_OPTIONS}
              value={gate.devOverride}
              onValueChange={(next) => {
                gate.setDevOverride(next);
                say(`Gate set to ${GATE_OPTIONS.find((option) => option.value === next)?.label}.`);
              }}
              testID="dev-states-gate"
            />
            <FactsList items={facts} />
            <Button
              variant="ink"
              label="Open what the gate shows"
              iconRight="arrow-right"
              fullWidth
              onPress={openGate}
              testID="dev-states-open"
            />
            <Button
              variant="outline"
              label="Clear the observer profile"
              fullWidth
              disabled={!profile.saved}
              disabledReason="There is no saved profile for this account."
              onPress={() => {
                profile.clear();
                say(
                  "Observer profile cleared on this device. The real gate opens onboarding unless the server profile has initials.",
                );
              }}
              testID="dev-states-clear-profile"
            />
            {status ? (
              <Note tone="neutral" live="polite">
                {status}
              </Note>
            ) : null}
          </View>
        </Island>

        <Island title="Data source" description={DATA_NOTES[data.mode]}>
          <Segmented
            label="Data source"
            options={DATA_OPTIONS}
            value={data.mode}
            onValueChange={(mode) => {
              data.setMode(mode);
              say(`Data source set to ${mode}.`);
            }}
            testID="dev-states-data"
          />
        </Island>

        <Island
          title="Screen"
          description="Writes the observer's screen preference, as Preferences does. The map palette stays separate."
        >
          <Segmented
            label="Screen theme"
            options={SCREEN_OPTIONS}
            value={preferences.screen}
            onValueChange={(screen) => preferences.set("screen", screen)}
            testID="dev-states-screen"
          />
        </Island>
      </View>
    </Screen>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    intro: { gap: t.space.s2, marginBottom: t.space.s7 },
    content: { gap: t.space.s4 },
    stack: { gap: t.space.s4 },
  });
}
