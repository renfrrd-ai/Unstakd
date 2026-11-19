export type LogLevel = "info" | "warn" | "err" | "step";
export type LogLine = { at: number; level: LogLevel; text: string };

export function formatLine(line: LogLine) {
  return `${line.at}\t${line.level}\t${line.text.replace(/[\r\n]+/g, " ")}`;
}

export function parseLine(raw: string): LogLine | null {
  const [at, level, ...rest] = raw.split("\t");
  if (!at || !level) return null;
  return { at: Number(at), level: level as LogLevel, text: rest.join("\t") };
}

export function stamp(ms: number) {
  const s = ms / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

// Published on Redis while a deploy runs. `seq` is the line's index in the log file,
// so a reader that has already sent N file lines forwards only messages with seq >= N.
export type LogMessage = (LogLine & { seq: number }) | { end: true };
