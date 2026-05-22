import crypto from "node:crypto";
import {
  assertVolume,
  type CommandLog,
  type CommandName,
  type CommandRequestPayload,
  type CommandResultPayload,
  type CommandSource,
  isDangerousCommand
} from "@pc-jarvis/shared";
import { AgentHub } from "./agent-hub.js";
import type { CommandLogStore } from "./log-store.js";

export interface ExecuteCommandInput {
  command: CommandName;
  source: CommandSource;
  requestedBy: string;
  confirmed?: boolean;
  args?: {
    volume?: unknown;
  };
}

export class CommandService {
  constructor(
    private readonly agentHub: AgentHub,
    private readonly logs: CommandLogStore
  ) {}

  async execute(input: ExecuteCommandInput): Promise<CommandResultPayload> {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const log: CommandLog = {
      id,
      command: input.command,
      source: input.source,
      status: "queued",
      requestedBy: input.requestedBy,
      createdAt
    };

    await this.logs.create(log);

    if (isDangerousCommand(input.command) && !input.confirmed) {
      const message = "Dangerous command requires explicit confirmation.";
      await this.logs.update(id, {
        status: "rejected",
        completedAt: new Date().toISOString(),
        errorMessage: message
      });
      return { id, command: input.command, status: "rejected", message, error: message };
    }

    const args = input.command === "set_volume" ? { volume: assertVolume(input.args?.volume) } : undefined;

    const payload: CommandRequestPayload = {
      id,
      command: input.command,
      source: input.source,
      requestedBy: input.requestedBy,
      args
    };

    try {
      await this.logs.update(id, { status: "running" });
      const result = await this.agentHub.sendCommand(payload);
      await this.logs.update(id, {
        status: result.status,
        completedAt: new Date().toISOString(),
        resultSummary: result.message,
        errorMessage: result.error
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown command failure.";
      await this.logs.update(id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: message
      });
      return { id, command: input.command, status: "failed", message, error: message };
    }
  }
}
