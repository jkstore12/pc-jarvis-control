export const COMMANDS = [
  "status",
  "screenshot",
  "open_chrome",
  "open_vscode",
  "shutdown",
  "restart",
  "set_volume"
] as const;

export type CommandName = (typeof COMMANDS)[number];

export const DANGEROUS_COMMANDS = ["shutdown", "restart"] as const satisfies readonly CommandName[];

export type DangerousCommandName = (typeof DANGEROUS_COMMANDS)[number];

export type CommandSource = "web" | "telegram" | "system";

export type CommandStatus = "queued" | "running" | "success" | "failed" | "rejected";

export interface PcStatus {
  pcName: string;
  online: boolean;
  cpuPercent: number;
  ramUsedPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskUsedPercent: number;
  diskFreeGb: number;
  diskTotalGb: number;
  uptimeSeconds: number;
  updatedAt: string;
}

export interface CommandRequestPayload {
  id: string;
  command: CommandName;
  source: CommandSource;
  requestedBy: string;
  args?: {
    volume?: number;
  };
}

export interface CommandResultPayload {
  id: string;
  command: CommandName;
  status: Extract<CommandStatus, "success" | "failed" | "rejected">;
  message: string;
  data?: {
    pcStatus?: PcStatus;
    screenshotBase64?: string;
    screenshotMimeType?: "image/png";
  };
  error?: string;
}

export interface CommandLog {
  id: string;
  command: CommandName;
  source: CommandSource;
  status: CommandStatus;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
  resultSummary?: string;
  errorMessage?: string;
}

export interface LoginResponse {
  token: string;
  user: {
    email: string;
  };
}

export function isAllowedCommand(value: string): value is CommandName {
  return COMMANDS.includes(value as CommandName);
}

export function isDangerousCommand(value: CommandName): value is DangerousCommandName {
  return DANGEROUS_COMMANDS.includes(value as DangerousCommandName);
}

export function assertVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Volume must be a number between 0 and 100.");
  }

  return Math.round(value);
}
