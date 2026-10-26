import { type LayoutChangeEvent, View } from "react-native";
import type { AnswerValue } from "../../forms/definition";
import type { ResolvedQuestion } from "../../forms/engine";
import { formatTemporalValue } from "../../forms/temporal";
import { Note, Text, Textarea, TextInput } from "../../ui";
import { TemporalInput } from "./TemporalInput";

export function QuestionValueInput({
  question,
  value,
  text,
  observer,
  rows,
  compactField,
  onWrite,
  onAdvance,
  onFieldLayout,
  onInputLayout,
}: {
  readonly question: ResolvedQuestion;
  readonly value: AnswerValue | undefined;
  readonly text: string;
  readonly observer: boolean;
  readonly rows: number;
  readonly compactField: boolean;
  readonly onWrite: (value: string) => void;
  readonly onAdvance: () => void;
  readonly onFieldLayout: (event: LayoutChangeEvent) => void;
  readonly onInputLayout: (event: LayoutChangeEvent) => void;
}) {
  const automatic = (question.valueSource ?? "manual") !== "manual";
  const source = {
    manual: "Manual",
    accountId: "Account ID",
    observerCode: "Observer code",
    captureTime: "Capture time",
  }[question.valueSource ?? "manual"];
  const inputText = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return (
    <>
      {automatic ? (
        <Note
          tone="neutral"
          title={`Automatic · ${source}${question.dateTime ? ` · ${question.dateTime.timeZone}` : ""}`}
        >
          <Text>
            {question.dateTime && typeof value === "string"
              ? formatTemporalValue(question.dateTime, value)
              : inputText ||
                "Capture value unavailable. This draft is retained; it cannot be saved with a missing automatic value."}
          </Text>
        </Note>
      ) : null}
      {!automatic &&
      (question.kind === "text" || question.kind === "number" || question.kind === "dateTime") ? (
        <View testID="collect-field" onLayout={onFieldLayout}>
          {question.kind === "dateTime" && question.dateTime ? (
            <TemporalInput
              key={question.id}
              config={question.dateTime}
              value={text}
              label={question.label}
              onWrite={onWrite}
            />
          ) : null}
          {question.kind === "text" && (question.rows ?? 1) > 1 ? (
            <Textarea
              accessibilityLabel={question.label}
              value={text}
              onChangeText={onWrite}
              rows={rows}
              onLayout={onInputLayout}
              disableFullscreenUI
              showCount={!compactField}
              maxLength={question.maxLength}
              placeholder={question.placeholder}
            />
          ) : null}
          {(question.kind === "text" && (question.rows ?? 1) <= 1) || question.kind === "number" ? (
            <TextInput
              accessibilityLabel={question.label}
              value={text}
              onChangeText={onWrite}
              keyboardType={question.kind === "number" ? "numbers-and-punctuation" : "default"}
              autoCapitalize={observer ? "characters" : "sentences"}
              autoCorrect={question.kind === "text" && !observer}
              maxLength={question.maxLength}
              placeholder={question.placeholder}
              disableFullscreenUI
              returnKeyType="next"
              onSubmitEditing={onAdvance}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}
