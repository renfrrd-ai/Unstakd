import { appendFile, mkdir } from "node:fs/promises";
import type { Redis } from "ioredis";
import { formatLine, type LogLevel, type LogLine, type LogMessage } from "@/lib/log-format";
import { logChannel, logDir, logPath } from "@/lib/logs";

// Writes a deploy's log file and mirrors each line to Redis for live viewers.
export class DeployLogger {
  private seq = 0;
  private chain: Promise<void> = Promise.resolve();
  constructor(private deploymentId: string, private pub: Redis, private startedAt = Date.now()) {}

  async init() {
    await mkdir(logDir(), { recursive: true });
  }

  line(level: LogLevel, text: string) {
    for (const part of text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").split(/\r?\n|\r/)) {
      if (!part.trim()) continue;
      const entry: LogLine = { at: Date.now() - this.startedAt, level, text: part.slice(0, 4000) };
      const msg: LogMessage = { ...entry, seq: this.seq++ };
      this.chain = this.chain.then(async () => {
        await appendFile(logPath(this.deploymentId), formatLine(entry) + "\n");
        await this.pub.publish(logChannel(this.deploymentId), JSON.stringify(msg));
      });
    }
  }

  info = (t: string) => this.line("info", t);
  warn = (t: string) => this.line("warn", t);
  err = (t: string) => this.line("err", t);
  step = (t: string) => this.line("step", t);

  async end() {
    await this.chain;
    await this.pub.publish(logChannel(this.deploymentId), JSON.stringify({ end: true } satisfies LogMessage));
  }
}
