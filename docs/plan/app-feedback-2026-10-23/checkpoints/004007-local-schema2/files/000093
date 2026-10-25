import {
  type DateTimeConfig,
  isCanonicalTemporalValue,
  resolveLocalDateTime,
} from "../../forms/temporal";

export function parseTemporalInput(
  config: DateTimeConfig,
  text: string,
  occurrence?: "earlier" | "later",
) {
  const pieces = text.trim().split(/\s+/);
  let date = config.mode === "time" ? "" : (pieces[0] ?? "");
  let time = config.mode === "date" ? "" : (pieces[config.mode === "time" ? 0 : 1] ?? "");
  if (config.dateFormat !== "iso" && date) {
    const [first, second, year] = date.split("/");
    date =
      config.dateFormat === "monthFirst"
        ? `${year}-${first}-${second}`
        : `${year}-${second}-${first}`;
  }
  if (config.timeFormat === "12h" && time) {
    const meridiem = pieces.at(-1)?.toUpperCase();
    const [hour, minute, second] = time.split(":");
    const numericHour = Number(hour);
    if (
      (meridiem !== "AM" && meridiem !== "PM") ||
      !Number.isInteger(numericHour) ||
      numericHour < 1 ||
      numericHour > 12
    )
      return { ok: false, reason: "invalid" } as const;
    time = `${String((numericHour % 12) + (meridiem === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}:${second}`;
  }
  const value = config.mode === "date" ? date : time;
  if (config.mode !== "dateTime")
    return isCanonicalTemporalValue(config, value)
      ? ({ ok: true, value } as const)
      : ({ ok: false, reason: "invalid" } as const);
  return resolveLocalDateTime(`${date}T${time}`, config.timeZone, occurrence);
}
