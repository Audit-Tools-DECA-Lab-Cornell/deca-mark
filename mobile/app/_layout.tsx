import { useFonts } from "expo-font";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { Suspense, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../src/auth/provider";
import { MeProvider } from "../src/data/api/me-provider";
import { type Gate, useGate } from "../src/features/auth/gate";
import { ProfileQueue } from "../src/features/auth/profile-sync";
import { DataSourceProvider, PREVIEW_ALLOWED } from "../src/features/preview/data-source";
import { useOrientationPreference } from "../src/layout/orientation";
import { resetHostedPackages } from "../src/packages/hosted/device";
import { HostedSitesProvider } from "../src/packages/hosted/provider";
import { FieldSessionProvider } from "../src/session/provider";
import { initializeCollectorDatabase } from "../src/storage/initialize-collector";
import { SyncProvider } from "../src/sync/provider";
import { interFonts } from "../src/theme-fonts";
import {
  Button,
  Logo,
  Screen,
  ScreenState,
  Text,
  type Theme,
  useStyles,
  useTheme,
} from "../src/ui";
import { contourFonts } from "../src/ui/fonts";
import { PreferencesProvider } from "../src/ui/preferences";
import { ThemeProvider } from "../src/ui/theme";

/** Inter stays until the last legacy Nocturne screen is replaced; Contour screens use Geologica. */
const FONTS = { ...interFonts, ...contourFonts };

/**
 * When a screen throws: the collector's error state (Contour, screen states). Its first line says the
 * work is safe, and "Try again" reloads the screen. It renders outside the root providers, so it brings
 * its own preferences and theme.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <Screen scroll>
          <ScreenState
            kind="error"
            body={`The screen could not load, but the point and answers you entered are kept. ${error.message}`}
            action={<Button variant="ink" icon="rotate-cw" label="Try again" onPress={retry} />}
          />
        </Screen>
      </ThemeProvider>
    </PreferencesProvider>
  );
}

function splashStyles(t: Theme) {
  return StyleSheet.create({
    splash: {
      flex: 1,
      justifyContent: "center",
      gap: t.space.s3,
      padding: t.layout.gutter,
      backgroundColor: t.c.ground,
    },
    mark: { marginBottom: t.space.s3 },
  });
}

/** The splash while fonts, the database or the account's profile are read. */
function Splash({ title, detail }: { title: string; detail: string }) {
  const s = useStyles(splashStyles);
  return (
    <View style={s.splash} accessibilityLiveRegion="polite">
      <View style={s.mark}>
        <Logo wordmark />
      </View>
      <Text variant="island" header>
        {title}
      </Text>
      <Text tone="ink2">{detail}</Text>
    </View>
  );
}

export default function RootLayout() {
  useOrientationPreference();
  // A missing face falls back to the system font rather than holding the collector shut.
  const [fontsReady, fontError] = useFonts(FONTS);
  return (
    // Preferences are read synchronously, so the first Contour frame is already in Day or Dusk.
    <GestureHandlerRootView style={styles.root}>
      <PreferencesProvider>
        <ThemeProvider>
          {!fontsReady && !fontError ? (
            <Splash title="Opening DECA Mark" detail="Preparing your local workspace…" />
          ) : (
            <Suspense
              fallback={
                <Splash title="Opening DECA Mark" detail="Preparing your local workspace…" />
              }
            >
              <SQLiteProvider
                databaseName="fieldmaps-shell.db"
                onInit={(db) => initializeCollectorDatabase(db, resetHostedPackages)}
                useSuspense
              >
                <AuthProvider>
                  {/* The signed-in account's /v1/me (profile, memberships, active project), cached
                      for offline starts. Everything below may read it. */}
                  <MeProvider>
                    <SyncProvider>
                      {/* Preview or device data for every screen. It sits under Sync and SQLite,
                          which its queue reads, and above the field session, so a session may
                          read it too. */}
                      <HostedSitesProvider>
                        <DataSourceProvider>
                          <FieldSessionProvider>
                            {/* Legacy screens are dark Nocturne. Contour screens set their own status
                              bar through the Screen primitive. */}
                            <StatusBar style="light" />
                            {/* Sends an observer profile saved offline once the account can take it. */}
                            <ProfileQueue />
                            <GatedStack />
                          </FieldSessionProvider>
                        </DataSourceProvider>
                      </HostedSitesProvider>
                    </SyncProvider>
                  </MeProvider>
                </AuthProvider>
              </SQLiteProvider>
            </Suspense>
          )}
        </ThemeProvider>
      </PreferencesProvider>
    </GestureHandlerRootView>
  );
}

const HOLD_TITLE = "Opening your workspace";
const HOLD_DETAIL = "Reading your observer profile…";

/**
 * The routes each part of the app may open (useGate). Signed out, or an account the server deleted:
 * sign-in only. Signed in without an observer profile on the server or this device: onboarding only.
 * Otherwise the app. When the gate changes, Stack.Protected drops the routes that closed and lands on the
 * first one that opened, so a finished onboarding or a sign-out moves on without a screen navigating by
 * itself. The review routes stay open in development and review builds whatever the gate says.
 *
 * While the gate holds (an account's `/v1/me` is not known yet), the splash stays up instead of a guess:
 * before the first route opens, in place of the stack, so a cold-start link still lands where it points;
 * after that, over the routes last opened, which stay mounted underneath.
 *
 * Routes not listed here are not guarded; new app routes go inside the (app) group. Two are open in
 * every state on purpose: `+not-found`, which says nothing was lost, and `+native-intent`, which keeps an
 * invitation link's code on this device before any gate is decided (pending-invitation-store).
 */
function GatedStack() {
  const gate = useGate();
  const decided = useRef<Gate | null>(null);
  if (gate.route !== "hold") decided.current = gate;
  const shown = decided.current;
  if (!shown) return <Splash title={HOLD_TITLE} detail={HOLD_DETAIL} />;
  const { signedIn, needsOnboarding } = shown;
  const holding = gate.route === "hold";
  return (
    <View style={styles.root}>
      {/* Covered by the splash while holding: screen readers skip it as touch does. */}
      <View
        style={styles.root}
        accessibilityElementsHidden={holding}
        importantForAccessibility={holding ? "no-hide-descendants" : "auto"}
      >
        <GuardedRoutes signedIn={signedIn} needsOnboarding={needsOnboarding} />
      </View>
      {holding ? (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Splash title={HOLD_TITLE} detail={HOLD_DETAIL} />
        </View>
      ) : null}
    </View>
  );
}

function GuardedRoutes({
  signedIn,
  needsOnboarding,
}: {
  signedIn: boolean;
  needsOnboarding: boolean;
}) {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.ground },
        animation: "fade",
      }}
    >
      <Stack.Protected guard={signedIn && !needsOnboarding}>
        {/* The tabs (Projects, Observations, Account), collect and the Explain sheet. */}
        <Stack.Screen name="(app)" />
        {/* The legacy Nocturne records screen, until the Observations tab (phase 8) replaces it. */}
        <Stack.Screen name="records" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsOnboarding}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={PREVIEW_ALLOWED}>
        <Stack.Screen name="(dev)" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
