import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { type Act, type FormDefinition, isObserverQuestion } from "../../forms/definition";
import type { ResolvedQuestion } from "../../forms/engine";
import type { SessionState } from "../../forms/session";
import {
  AnswerGrid,
  AnswerTile,
  Button,
  Mono,
  Note,
  Text,
  TextLink,
  type Theme,
  useHaptics,
  useStyles,
  useTheme,
} from "../../ui";
import { QuestionValueInput } from "./QuestionValueInput";

type Props = {
  readonly form: FormDefinition;
  readonly state: SessionState;
  readonly question: ResolvedQuestion;
  readonly position: number;
  readonly total: number;
  readonly columns: number;
  readonly onChoose: (option: string) => void;
  readonly onToggle: (option: string) => void;
  readonly onWrite: (value: string) => void;
  readonly onBack: () => void;
  readonly onAdvance: () => void;
  readonly onReview: () => void;
  /** "Adjust point" for a play event; absent for a zone inventory, which has no point. */
  readonly onAdjust?: (() => void) | undefined;
  /** The software keyboard is up: a typed answer scrolls to keep its field above it (MOB-34). */
  readonly keyboardUp?: boolean | undefined;
  /** False when the keyboard leaves no room for the "Review answers" and "Adjust point" links. */
  readonly showLinks?: boolean | undefined;
  /**
   * The keyboard leaves the scrolling area shorter than a full text field (a phone in landscape):
   * the field shows two rows and no counter, still grows with what is typed, and its first line
   * stays inside the area.
   */
  readonly compactField?: boolean | undefined;
};

/** The gap kept between the typed field and the foot of the scrolling area. */
const FIELD_MARGIN = 8;
/** The most rows a text field shows while `compactField` is on. */
const COMPACT_ROWS = 2;

/**
 * The row of the box a caret sits on, from 0, for a box of `lines` rows. Text that wraps nowhere puts
 * it after the line breaks before it; wrapped text is measured only by the box's height, so the row
 * is then taken in proportion to the characters before the caret, never above the breaks before it.
 */
export function caretLine(text: string, caret: number, lines: number): number {
  const before = text.slice(0, caret);
  const breaks = before.split("\n").length - 1;
  const hardLines = text.split("\n").length;
  const row = lines > hardLines ? Math.floor((caret / Math.max(1, text.length)) * lines) : breaks;
  return Math.min(lines - 1, Math.max(breaks, row));
}

/** The acts a form actually asks, in order: Child · Social · Play · Setting, or Climate · Inventory. */
export function formActs(form: FormDefinition): readonly Act[] {
  const acts: Act[] = [];
  for (const question of form.questions) if (!acts.includes(question.act)) acts.push(question.act);
  return acts;
}

function stepStyles(t: Theme) {
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0 },
    acts: { flexDirection: "row", gap: t.space.s1, paddingTop: t.space.s2 },
    act: { flex: 1, height: 4, flexDirection: "row" },
    scroll: { flex: 1, minHeight: 0 },
    body: { paddingTop: t.space.s4, paddingBottom: t.space.s4, gap: t.space.s4 },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: t.space.s3,
      paddingTop: t.space.s3,
      borderTopWidth: t.size.border,
      borderTopColor: t.c.rule,
    },
    grow: { flexGrow: 1 },
    links: { flexDirection: "row", flexWrap: "wrap", gap: t.space.s5, alignItems: "center" },
  });
}

/**
 * One question at a time, on Contour (MOB-26 step 3). A single choice fills its tile and moves on by
 * itself after a beat; several choices, text and numbers wait for Continue. The next question fades
 * in and the screen reader moves to its heading. Validation waits for review, so an empty required
 * answer never interrupts the stack; Continue reads "Skip for now" until something is answered.
 */
export function QuestionStep({
  form,
  state,
  question,
  position,
  total,
  columns,
  onChoose,
  onToggle,
  onWrite,
  onBack,
  onAdvance,
  onReview,
  onAdjust,
  keyboardUp = false,
  showLinks = true,
  compactField = false,
}: Props) {
  const s = useStyles(stepStyles);
  const theme = useTheme();
  const haptics = useHaptics();
  const reduceMotion = useReducedMotion();
  const value = state.answers[question.id];
  const single = typeof value === "string" ? value : "";
  const chosen = Array.isArray(value) ? value : [];
  const acts = formActs(form);
  const actIndex = acts.indexOf(question.act);
  const inputText = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(inputText);
  const [shown, setShown] = useState(question.id);
  /** The caret's character offset in a multi-line answer; null until the observer has moved it. */
  const caretAt = useRef<number | null>(null);
  // Reload the field only when the question changes, not whenever the stored answer lands.
  if (shown !== question.id) {
    setShown(question.id);
    setText(inputText);
    caretAt.current = null;
  }

  // While the keyboard is up, a text or number answer is kept in view above the footer, and the
  // area can be shorter than the field (an iPhone SE: about 114 pt against a 4-row field of 151). The
  // field grows with what is typed and the caret sits at its end, so once typed text has outgrown the
  // rows the foot of the field is kept. An empty field always keeps its top, however tall its box:
  // React Native measures an empty input by its placeholder, which can wrap past the rows, so the
  // box height says nothing about the caret. An answered field at its minimum height keeps its top
  // too, so the first line is never scrolled out above the area.
  const rows = compactField ? Math.min(question.rows ?? 4, COMPACT_ROWS) : (question.rows ?? 4);
  const rowsMinHeight = theme.space.s4 * 2 + rows * (theme.type.answer.lineHeight ?? 0);
  const scroller = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const fieldTop = useRef(0);
  const fieldBottom = useRef(0);
  /** The height of the text box itself; it is the rows' minimum height until the text outgrows them. */
  const boxHeight = useRef(0);
  /** Where the text box starts inside the field (its border). */
  const boxTop = useRef(0);
  const automatic = (question.valueSource ?? "manual") !== "manual";
  const typing =
    !automatic &&
    (question.kind === "text" || question.kind === "number" || question.kind === "dateTime");
  const multiline = question.kind === "text" && (question.rows ?? 1) > 1;
  /** The current text, so `showField` reads it as of the latest render, not the one it was made in. */
  const typed = useRef(text);
  typed.current = text;
  const rowsHeight = useRef(rowsMinHeight);
  rowsHeight.current = rowsMinHeight;
  const padding = theme.space.s4;
  const lineHeight = theme.type.answer.lineHeight ?? 0;
  const showField = useCallback(() => {
    if (!keyboardUp || !typing || viewport.current === 0) return;
    const foot = Math.max(0, fieldBottom.current + FIELD_MARGIN - viewport.current);
    // Only typed text can outgrow the rows; an empty box measured by its placeholder is not grown.
    const grown = multiline && typed.current !== "" && boxHeight.current > rowsHeight.current + 0.5;
    let y = grown ? foot : Math.min(foot, fieldTop.current);
    // The text box never scrolls itself, so an edit on an earlier line of a grown answer keeps that
    // line in view, not the foot: a rotation with the keyboard open lays the field out again.
    const caret = caretAt.current;
    if (grown && caret !== null && caret < typed.current.length && lineHeight > 0) {
      const lines = Math.max(1, Math.round((boxHeight.current - padding * 2) / lineHeight));
      const line = caretLine(typed.current, caret, lines);
      const lineBottom = fieldTop.current + boxTop.current + padding + (line + 1) * lineHeight;
      y = Math.max(0, lineBottom + FIELD_MARGIN - viewport.current);
    }
    scroller.current?.scrollTo({ y, animated: false });
  }, [keyboardUp, typing, multiline, padding, lineHeight]);
  useEffect(showField, [showField]);

  const answered =
    question.kind === "many"
      ? chosen.length > 0
      : question.kind === "one"
        ? single.trim() !== ""
        : (automatic ? inputText : text).trim() !== "";
  const observer = isObserverQuestion(question, form.columnNaming);

  function type(next: string) {
    const cleaned = observer ? next.toUpperCase().replace(/\s+/g, "") : next;
    setText(cleaned);
    onWrite(cleaned);
  }

  return (
    <View style={s.root}>
      <View
        style={s.acts}
        accessible
        accessibilityLabel={`Part ${actIndex + 1} of ${acts.length}, ${question.act}`}
      >
        {acts.map((act, index) => (
          <View key={act} style={s.act}>
            <ActSegment
              state={index < actIndex ? "done" : index === actIndex ? "current" : "next"}
            />
          </View>
        ))}
      </View>

      <ScrollView
        ref={scroller}
        style={s.scroll}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onLayout={(event: LayoutChangeEvent) => {
          viewport.current = event.nativeEvent.layout.height;
          showField();
        }}
      >
        <Animated.View
          key={question.id}
          {...(reduceMotion ? {} : { entering: FadeIn.duration(120) })}
          style={{ gap: 12 }}
        >
          <View style={s.head}>
            <Mono variant="label" tone="accent">{`Question ${position} · ${question.act}`}</Mono>
            <Mono variant="data" tone="ink2">{`${position} of ${total}`}</Mono>
          </View>
          <QuestionHeading label={question.label} />
          {question.hint ? (
            <Text tone="ink2" selectable>
              {question.hint}
            </Text>
          ) : null}
          {question.openedBy ? (
            <Text variant="small" tone="ink2">
              {question.openedBy}
            </Text>
          ) : null}
        </Animated.View>

        {question.kind === "one" || question.kind === "many" ? (
          <AnswerGrid
            columns={Math.min(columns, question.columns > 1 ? question.columns : columns)}
          >
            {question.options.map((option) => {
              const selected =
                question.kind === "one" ? single === option.code : chosen.includes(option.code);
              return (
                <AnswerTile
                  key={option.code}
                  label={option.label}
                  selected={selected}
                  multiple={question.kind === "many"}
                  onPress={() => {
                    haptics.selection();
                    if (question.kind === "one") onChoose(option.code);
                    else onToggle(option.code);
                  }}
                />
              );
            })}
          </AnswerGrid>
        ) : null}

        {question.optionsPending ? (
          <Note tone="waiting" icon="flag" title="No option list yet.">
            {question.optionsPending}
          </Note>
        ) : null}

        <QuestionValueInput
          key={question.id}
          question={question}
          value={value}
          text={text}
          observer={observer}
          rows={rows}
          compactField={compactField}
          onWrite={type}
          onAdvance={onAdvance}
          onFieldLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            fieldTop.current = y;
            fieldBottom.current = y + height;
            showField();
          }}
          onInputLayout={(event) => {
            boxTop.current = event.nativeEvent.layout.y;
            boxHeight.current = event.nativeEvent.layout.height;
            showField();
          }}
          onCaretChange={(caret) => {
            caretAt.current = caret;
          }}
        />

        {question.protocolFlag ? (
          <Note tone="waiting" icon="flag" title="Protocol note.">
            {question.protocolFlag}
          </Note>
        ) : null}

        {state.notice ? (
          <Note
            tone="waiting"
            icon="triangle-alert"
            live="polite"
            title={`${state.notice.count} ${state.notice.count === 1 ? "answer was" : "answers were"} dropped.`}
          >
            {`No longer asked: ${state.notice.questions.join("; ")}. Hidden answers are never saved.`}
          </Note>
        ) : null}
      </ScrollView>

      <View style={s.actions}>
        <Button variant="outline" icon="arrow-left" label="Back" onPress={onBack} />
        <Button
          variant="ink"
          iconRight="arrow-right"
          label={answered || question.kind === "one" ? "Continue" : "Skip for now"}
          onPress={onAdvance}
          accessibilityHint={
            answered ? undefined : "Unanswered required questions are named at review."
          }
          style={s.grow}
        />
      </View>
      {showLinks ? (
        <View testID="collect-links" style={[s.links, { paddingTop: 12 }]}>
          <TextLink label="Review answers" icon="list" onPress={onReview} />
          {onAdjust ? <TextLink label="Adjust point" icon="map-pin" onPress={onAdjust} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The question as a heading. It mounts again for every question (its parent is keyed by the question),
 * and on mount it takes the screen reader's focus, so VoiceOver and TalkBack follow the stack.
 */
function QuestionHeading({ label }: { readonly label: string }) {
  const node = useRef<View>(null);
  useEffect(() => {
    const handle = node.current ? findNodeHandle(node.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, []);
  return (
    <View ref={node} accessible accessibilityRole="header" accessibilityLabel={label}>
      <Text variant="question">{label}</Text>
    </View>
  );
}

function ActSegment({ state }: { readonly state: "done" | "current" | "next" }) {
  const s = useStyles(segmentStyles);
  return <View style={[s.fill, s[state]]} />;
}

function segmentStyles(t: Theme) {
  return StyleSheet.create({
    fill: { flex: 1, borderRadius: 2 },
    done: { backgroundColor: t.c.ink },
    current: { backgroundColor: t.c.accent },
    next: { backgroundColor: t.c.well },
  });
}
