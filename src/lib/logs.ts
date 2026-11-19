import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { formatLine, parseLine, type LogLine } from "./log-format";

export type { LogLine } from "./log-format";

export const logDir = () => process.env.LOG_DIR ?? ".data/logs";
export const logPath = (deploymentId: string) => path.join(logDir(), `${deploymentId}.log`);
export const logChannel = (deploymentId: string) => `logs:${deploymentId}`;

export async function appendLog(deploymentId: string, lines: LogLine[]) {
  await mkdir(logDir(), { recursive: true });
  await appendFile(logPath(deploymentId), lines.map(formatLine).join("\n") + "\n");
}

export async function readLog(deploymentId: string): Promise<LogLine[]> {
  try {
    const raw = await readFile(logPath(deploymentId), "utf8");
    return raw.split("\n").map(parseLine).filter((l): l is LogLine => l !== null);
  } catch {
    return [];
  }
}
