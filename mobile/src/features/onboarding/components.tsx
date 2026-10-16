import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import {
  Avatar,
  Icon,
  InnerPanel,
  StatusLine,
  Text,
  type Theme,
  useStyles,
  useTheme,
} from "../../ui";
import { useProfile } from "../auth/profile-store";
import { PROFILE_QUEUED } from "../auth/profile-sync";
import { useDataSource } from "../preview/data-source";

/**
 * Pieces the onboarding screens share (mobile-29 to 31). They compose Contour primitives and read every
 * colour and size from the theme.
 */

function makeStyles(t: Theme) {
  return StyleSheet.create({
    intro: { gap: t.space.s2 },
    introTitle: { gap: t.space.s1 },
    recorded: { flexDirection: "row", alignItems: "center", gap: t.space.s4 },
    recordedText: { flex: 1, gap: t.space.s1 },
    emptyMark: {
      width: t.size.collector,
      height: t.size.collector,
      borderRadius: t.size.collector / 2,
      borderWidth: t.size.border,
      borderStyle: "dashed",
      borderColor: t.c.edge,
    },
    scope: { gap: t.space.s2 },
    scopeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: t.space.s3,
      paddingVertical: t.space.s2,
      borderBottomWidth: t.size.border,
      borderBottomColor: t.c.line,
    },
    scopeFirst: { borderTopWidth: t.size.border, borderTopColor: t.c.line },
    // The glyph sits on the first line of text, however many lines the words wrap to.
    scopeGlyph: { height: t.type.body.lineHeight, justifyContent: "center" },
    scopeText: { flex: 1 },
    foot: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.s4,
      paddingTop: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.line,
    },
    footText: { flex: 1 },
  });
}

/** The heading block of an onboarding step: an optional mono eyebrow, the title and a lead line. */
export function StepIntro({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string | undefined;
  title: string;
  lead: string;
}) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.intro}>
      <View style={s.introTitle}>
        {eyebrow ? (
          <Text variant="monoLabel" tone="ink2">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="page" header>
          {title}
        </Text>
      </View>
      <Text variant="body" tone="ink2">
        {lead}
      </Text>
    </View>
  );
}

const RECORDED_AS =
  "Stored with each observation you save from now on. You can change it for one session in the session brief.";

/** "Recorded as": the observer code as it will be stamped, updated as the initials are typed. */
export function RecordedAs({ initials }: { initials: string }) {
  const s = useStyles(makeStyles);
  // Spelled out so a screen reader reads the code letter by letter, as it is said aloud in the field.
  const spoken = initials ? `Recorded as ${initials.split("").join(" ")}.` : "No initials yet.";
  return (
    <InnerPanel tone="well" testID="recorded-as">
      <View style={s.recorded} accessible accessibilityLabel={`${spoken} ${RECORDED_AS}`}>
        {/* Until initials are typed, an empty dashed slot rather than a blank ink circle. */}
        {initials ? (
          <Avatar initials={initials} tone="ink" size="lg" />
        ) : (
          <View style={s.emptyMark} />
        )}
        <View style={s.recordedText}>
          <Text variant="monoLabel" tone="ink2">
            Recorded as
          </Text>
          <Text variant="body">{RECORDED_AS}</Text>
        </View>
      </View>
    </InnerPanel>
  );
}

export type ScopeItem = { allowed: boolean; text: string };

/** What a role can and cannot do, under a mono heading: "AS AN OBSERVER" (mobile-31). */
export function ScopeList({ title, items }: { title: string; items: readonly ScopeItem[] }) {
  const t = useTheme();
  const s = useStyles(makeStyles);
  return (
    <View style={s.scope}>
      <Text variant="monoLabel" tone="ink2" header>
        {title}
      </Text>
      <View accessibilityRole="list">
        {items.map((item, index) => (
          <View
            key={item.text}
            accessible
            accessibilityLabel={item.text}
            style={[s.scopeRow, index === 0 ? s.scopeFirst : null]}
          >
            <View style={s.scopeGlyph}>
              <Icon
                name={item.allowed ? "check" : "x"}
                size={20}
                color={item.allowed ? t.c.saved : t.c.ink2}
              />
            </View>
            <Text variant="body" tone={item.allowed ? "ink" : "ink2"} style={s.scopeText}>
              {item.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * "Saved on this phone. It reaches your account when you are online." while the name and initials wait
 * on this device for the account to take them (device data only; preview sends nothing).
 */
export function ProfileQueuedLine() {
  const { pending } = useProfile();
  const { mode } = useDataSource();
  if (!pending || mode !== "device") return null;
  return (
    <StatusLine
      tone="waiting"
      icon="smartphone"
      text={PROFILE_QUEUED}
      live
      testID="onboarding-profile-queued"
    />
  );
}

/** A footnote at the foot of a step, under a rule, with its way out on the right: "Skip for now". */
export function StepFoot({ text, action }: { text: string; action: ReactNode }) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.foot}>
      <Text variant="small" tone="ink2" style={s.footText}>
        {text}
      </Text>
      {action}
    </View>
  );
}
