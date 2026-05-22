import "dotenv/config";
import { z } from "zod";

const optionalNonEmptyString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  STATIC_WEB_DIR: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((value) => value.toLowerCase() === "true"),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must have at least 32 characters."),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  AGENT_SECRET: z.string().min(24, "AGENT_SECRET must have at least 24 characters."),
  DANGEROUS_CONFIRMATION_PHRASE: z.string().default("CONFIRMAR"),
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmptyString,
  TELEGRAM_BOT_TOKEN: optionalNonEmptyString,
  TELEGRAM_ALLOWED_USER_IDS: z.string().default("")
});

export type ServerEnv = z.infer<typeof schema>;

export function loadEnv(): ServerEnv {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${message}`);
  }

  return parsed.data;
}

export function parseAllowedTelegramUsers(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
