import { CollectorVersionError } from "../storage/database-migrations";
import { Button } from "./Button";
import { PreferencesProvider } from "./preferences";
import { Screen } from "./Screen";
import { ScreenState } from "./ScreenState";
import { ThemeProvider } from "./theme";

/**
 * What the root error boundary shows when a screen, or the collector's database, throws. It renders
 * outside the root providers, so it brings its own preferences and theme.
 * - A database written by a newer build (`CollectorVersionError`): the one sentence, with no retry,
 *   because a retry cannot read it either. Nothing was deleted, and it says so.
 * - Anything else: the screen could not load, the point and answers are kept, "Try again".
 */
export function ScreenFailure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <Screen scroll>
          {error instanceof CollectorVersionError ? (
            <ScreenState
              kind="error"
              title="Update DECA Mark"
              body={error.message}
              icon="download"
              testID="collector-version-refused"
            />
          ) : (
            <ScreenState
              kind="error"
              body={`The screen could not load, but the point and answers you entered are kept. ${error.message}`}
              action={<Button variant="ink" icon="rotate-cw" label="Try again" onPress={retry} />}
            />
          )}
        </Screen>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
