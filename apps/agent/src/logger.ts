import { mkdir, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";

type LogLevel = "info" | "warn" | "error";

export interface AgentLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  details?: Record<string, unknown>;
}

export class LocalAgentLogger {
  private ready: Promise<void>;

  constructor(private readonly logDir: string) {
    this.ready = mkdir(logDir, { recursive: true }).then(() => undefined);
  }

  async info(event: string, details?: Record<string, unknown>) {
    await this.write({ timestamp: new Date().toISOString(), level: "info", event, details });
  }

  async warn(event: string, details?: Record<string, unknown>) {
    await this.write({ timestamp: new Date().toISOString(), level: "warn", event, details });
  }

  async error(event: string, details?: Record<string, unknown>) {
    await this.write({ timestamp: new Date().toISOString(), level: "error", event, details });
  }

  async saveLatestStatus(status: unknown) {
    await this.ready;
    await writeFile(path.join(this.logDir, "latest-status.json"), `${JSON.stringify(status, null, 2)}\n`, "utf8");
  }

  private async write(entry: AgentLogEntry) {
    await this.ready;
    const safeEntry = redactSecrets(entry);
    const date = safeEntry.timestamp.slice(0, 10);
    const line = `${JSON.stringify(safeEntry)}\n`;

    await Promise.all([
      appendFile(path.join(this.logDir, "agent.log.jsonl"), line, "utf8"),
      appendFile(path.join(this.logDir, `agent-${date}.log.jsonl`), line, "utf8")
    ]);
  }
}

function redactSecrets(entry: AgentLogEntry): AgentLogEntry {
  if (!entry.details) {
    return entry;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(entry.details)) {
    redacted[key] = /secret|token|password|authorization/i.test(key) ? "[redacted]" : value;
  }

  return { ...entry, details: redacted };
}
