import path from "node:path";
import { config } from "dotenv";
import { z } from "zod";

config();
config({ path: path.resolve(process.cwd(), "apps/agent/.env"), override: false });

const schema = z.object({
  SERVER_URL: z.string().url(),
  AGENT_SECRET: z.string().min(24),
  PC_NAME: z.string().default(process.env.COMPUTERNAME ?? "Windows PC"),
  STATUS_INTERVAL_MS: z.coerce.number().default(5000),
  LOG_DIR: z.string().default("logs"),
  LOG_STATUS_HEARTBEATS: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  POWER_COMMANDS_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true")
});

export type AgentEnv = z.infer<typeof schema>;

export function loadEnv(): AgentEnv {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid agent environment:\n${message}`);
  }

  return parsed.data;
}
