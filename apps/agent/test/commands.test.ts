import { describe, expect, it } from "vitest";
import { executeCommand } from "../src/commands.js";
import type { AgentEnv } from "../src/env.js";

const env: AgentEnv = {
  SERVER_URL: "http://localhost:4000",
  AGENT_SECRET: "agent-secret-agent-secret",
  PC_NAME: "Test PC",
  STATUS_INTERVAL_MS: 5000,
  LOG_DIR: "logs",
  LOG_STATUS_HEARTBEATS: false,
  POWER_COMMANDS_ENABLED: false
};

describe("agent command validation", () => {
  it("rejects malformed payloads before running PowerShell", async () => {
    const result = await executeCommand(env, { command: "open_chrome" });

    expect(result.status).toBe("rejected");
    expect(result.id).toBe("invalid-payload");
  });

  it("rejects unsafe volume values before running PowerShell", async () => {
    const result = await executeCommand(env, {
      id: "cmd-1",
      command: "set_volume",
      source: "web",
      requestedBy: "admin@example.com",
      args: { volume: 150 }
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Volume");
  });
});
