/** One visual line of a wrapped text, as `onTextLayout` reports it: its text and where it sits. */
export type MeasuredLine = {
  readonly text: string;
  readonly y: number;
  readonly height: number;
};

/**
 * The measured line a caret sits on, found by walking the lines' texts to the caret's character
 * offset. A caret at the first character of a line is on that line. Returns null when the lines are not
 * a layout of `text` (measured for an earlier answer, or none yet), so the caller falls back.
 */
export function caretRow(
  text: string,
  caret: number,
  lines: readonly MeasuredLine[],
): { readonly y: number; readonly height: number } | null {
  let cursor = 0;
  let found: MeasuredLine | null = null;
  for (const line of lines) {
    let start = cursor;
    if (line.text !== "") {
      const at = text.indexOf(line.text, cursor);
      if (at < 0) return null;
      start = at;
      cursor = at + line.text.length;
    }
    if (start <= caret) found = line;
  }
  // The lines must cover the whole answer; a layout of a shorter or longer answer says nothing.
  if (!found || text.slice(cursor).trim() !== "") return null;
  return { y: found.y, height: found.height };
}
