import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CommandLog, CommandStatus } from "@pc-jarvis/shared";
import type { ServerEnv } from "./env.js";

interface StoredCommandLog extends CommandLog {}

export interface CommandLogStore {
  create(log: CommandLog): Promise<void>;
  update(id: string, patch: Partial<Pick<CommandLog, "status" | "completedAt" | "resultSummary" | "errorMessage">>): Promise<void>;
  list(limit?: number): Promise<CommandLog[]>;
}

function toDb(log: CommandLog) {
  return {
    id: log.id,
    command: log.command,
    source: log.source,
    status: log.status,
    requested_by: log.requestedBy,
    created_at: log.createdAt,
    completed_at: log.completedAt ?? null,
    result_summary: log.resultSummary ?? null,
    error_message: log.errorMessage ?? null
  };
}

function fromDb(row: Record<string, unknown>): CommandLog {
  return {
    id: String(row.id),
    command: row.command as CommandLog["command"],
    source: row.source as CommandLog["source"],
    status: row.status as CommandStatus,
    requestedBy: String(row.requested_by),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    resultSummary: row.result_summary ? String(row.result_summary) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
}

class MemoryCommandLogStore implements CommandLogStore {
  private readonly logs = new Map<string, StoredCommandLog>();

  async create(log: CommandLog): Promise<void> {
    this.logs.set(log.id, { ...log });
  }

  async update(id: string, patch: Partial<CommandLog>): Promise<void> {
    const existing = this.logs.get(id);
    if (!existing) {
      return;
    }

    this.logs.set(id, { ...existing, ...patch });
  }

  async list(limit = 50): Promise<CommandLog[]> {
    return [...this.logs.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }
}

class SupabaseCommandLogStore implements CommandLogStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async create(log: CommandLog): Promise<void> {
    const { error } = await this.supabase.from("command_logs").insert(toDb(log));
    if (error) {
      throw new Error(`Failed to create command log: ${error.message}`);
    }
  }

  async update(id: string, patch: Partial<CommandLog>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status) dbPatch.status = patch.status;
    if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;
    if (patch.resultSummary !== undefined) dbPatch.result_summary = patch.resultSummary;
    if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;

    const { error } = await this.supabase.from("command_logs").update(dbPatch).eq("id", id);
    if (error) {
      throw new Error(`Failed to update command log: ${error.message}`);
    }
  }

  async list(limit = 50): Promise<CommandLog[]> {
    const { data, error } = await this.supabase
      .from("command_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list command logs: ${error.message}`);
    }

    return (data ?? []).map((row) => fromDb(row));
  }
}

export function createCommandLogStore(env: Pick<ServerEnv, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">): CommandLogStore {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseCommandLogStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    }));
  }

  console.warn("Supabase env vars not configured. Using in-memory command logs for this process.");
  return new MemoryCommandLogStore();
}
