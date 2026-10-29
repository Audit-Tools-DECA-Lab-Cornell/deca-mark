import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { FormDefinition } from "../../forms/definition";
import {
  answerSummary,
  exportAnswers,
  isAnswered,
  type ReviewProblem,
  visibleQuestions,
} from "../../forms/engine";
import type { SessionState } from "../../forms/session";
import {
  Button,
  Icon,
  Mono,
  Note,
  Text,
  TextLink,
  type Theme,
  useStyles,
  useTheme,
} from "../../ui";

type Props = {
  readonly form: FormDefinition;
  readonly state: SessionState;
  /** "OBS-3F2A1B · Zone B · Standard round": what is about to be stored. */
  readonly summary: string;
  readonly onJump: (index: number) => void;
  readonly onBack: () => void;
  readonly onSave: () => Promise<{ problems: readonly ReviewProblem[]; message?: string } | null>;
  readonly onDiscard: () => void;
  /** On a bound map, why the point cannot be saved in this zone now (MUI-4), or null. */
  readonly placementBlock?: string | null | undefined;
  /** Moves the point again, keeping every answer. */
  readonly onAdjust?: (() => void) | undefined;
};

const REASON: Record<ReviewProblem["reason"], string> = {
  required: "Needs an answer",
  range: "Out of range",
  type: "Not a valid answer",
  option: "Not one of the options",
  duplicate: "Chosen twice",
  maxLength: "Too long",
};

function reviewStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0 },
    body: { paddingTop: t.space.s4, paddingBottom: t.space.s4, gap: t.space.s4 },
    act: { marginTop: t.space.s2 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: t.space.s3,
      minHeight: t.size.touch,
      paddingVertical: t.space.s3,
      borderBottomWidth: t.size.border,
      borderBottomColor: t.c.rule,
    },
    question: { flex: 1 },
    answer: { flex: 1, alignItems: "flex-end", gap: 2 },
    flagged: { flexDirection: "row", alignItems: "center", gap: 4 },
    actions: {
      gap: t.space.s3,
      paddingTop: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
  });
}

/**
 * Review, before saving (MOB-26): every visible answer, grouped by act, each row a way back to its
 * question. Validation happens here and only here: missing answers are named on their rows and the
 * save says how many remain. Saving stores the record on this device; uploading follows on its own.
 * While it stores, nothing else on the step answers a tap (MOB-41): a row, "Keep answering" or
 * "Discard observation" would change the observation that is being written.
 */
export function ReviewStep({
  form,
  state,
  summary,
  onJump,
  onBack,
  onSave,
  onDiscard,
  placementBlock = null,
  onAdjust,
}: Props) {
  const s = useStyles(reviewStyles);
  const t = useTheme();
  const [problems, setProblems] = useState<readonly ReviewProblem[]>([]);
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = visibleQuestions(form, state.answers);
  const answered = visible.filter((question) => isAnswered(state.answers[question.id])).length;
  const withoutColumn = exportAnswers(form, state.answers).withoutColumn;
  const flagged = new Map(problems.map((problem) => [problem.question.id, problem.reason]));

  async function save() {
    setSaving(true);
    setFailure("");
    const outcome = await onSave();
    if (outcome === null) return;
    setSaving(false);
    setProblems(outcome.problems);
    setFailure(outcome.message ?? "");
  }

  let lastAct = "";
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Mono variant="label" tone="ink2">
            Review · before saving
          </Mono>
          <Text variant="island" header>
            {`${answered} of ${visible.length} answered`}
          </Text>
          <Text variant="small" tone="ink2">
            {summary}
          </Text>
        </View>

        {problems.length > 0 ? (
          <Note
            tone="attention"
            live="assertive"
            title={`${problems.length} ${problems.length === 1 ? "answer needs" : "answers need"} attention.`}
          >
            They are marked below. Tap one to answer it; nothing you entered is lost.
          </Note>
        ) : null}
        {placementBlock ? (
          <Note
            tone="attention"
            live="assertive"
            title="Not saved yet."
            action={
              onAdjust ? (
                <TextLink label="Adjust point" icon="crosshair" onPress={onAdjust} />
              ) : undefined
            }
          >
            {placementBlock.replace(/^Not saved yet\. /, "")}
          </Note>
        ) : null}
        {failure !== "" ? (
          <Note tone="attention" live="assertive" title="Not saved yet.">
            {`${failure} Your answers are still here.`}
          </Note>
        ) : null}

        <View>
          {visible.map((question, index) => {
            const group = question.act === lastAct ? "" : question.act;
            lastAct = question.act;
            const value = state.answers[question.id];
            const reason = flagged.get(question.id);
            const shown = answerSummary(question, value);
            return (
              <View key={question.id}>
                {group !== "" ? (
                  <View style={s.act}>
                    <Mono variant="label" tone="accent">
                      {group}
                    </Mono>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${question.label}. ${reason ? `${REASON[reason]}. ` : ""}${shown}.`}
                  accessibilityHint="Answers this question again."
                  accessibilityState={{ disabled: saving }}
                  disabled={saving}
                  onPress={saving ? undefined : () => onJump(index)}
                  style={({ pressed }) => [s.row, pressed ? { backgroundColor: t.c.well } : null]}
                >
                  <Text variant="small" tone="ink2" style={s.question}>
                    {question.label}
                  </Text>
                  <View style={s.answer}>
                    {reason ? (
                      <View style={s.flagged}>
                        <Icon name="triangle-alert" size={16} color={t.c.attention} />
                        <Text variant="smallStrong" tone="attention">
                          {REASON[reason]}
                        </Text>
                      </View>
                    ) : null}
                    <Text
                      variant="bodyStrong"
                      tone={isAnswered(value) ? "ink" : "ink2"}
                      align="right"
                    >
                      {shown}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

        {withoutColumn.length > 0 ? (
          <Note
            tone="neutral"
            title={`${withoutColumn.length} ${withoutColumn.length === 1 ? "answer has" : "answers have"} no export column yet.`}
          >
            {`${withoutColumn.map((question) => question.label).join("; ")}. They are stored by question until the column names are agreed.`}
          </Note>
        ) : null}
      </ScrollView>

      <View style={s.actions}>
        <Button
          label="Save on this device"
          icon="check"
          size="collector"
          fullWidth
          busy={saving}
          busyLabel="Saving on this device…"
          disabled={placementBlock !== null}
          disabledReason={placementBlock ?? undefined}
          onPress={() => {
            void save();
          }}
          testID="collect-save"
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
          <TextLink label="Keep answering" arrow="left" disabled={saving} onPress={onBack} />
          <TextLink label="Discard observation" tone="ink" disabled={saving} onPress={onDiscard} />
        </View>
      </View>
    </View>
  );
}
