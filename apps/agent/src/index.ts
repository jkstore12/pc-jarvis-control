import { io } from "socket.io-client";
import { loadEnv } from "./env.js";
import { executeCommand, getPcStatus } from "./commands.js";
import { LocalAgentLogger } from "./logger.js";

const env = loadEnv();
const logger = new LocalAgentLogger(env.LOG_DIR);
const socket = io(env.SERVER_URL, {
  auth: {
    role: "agent",
    token: env.AGENT_SECRET
  },
  reconnection: true,
  reconnectionDelayMax: 10_000
});

async function emitStatus() {
  try {
    const status = await getPcStatus(env.PC_NAME);
    socket.emit("agent:status", status);
    await logger.saveLatestStatus(status);

    if (env.LOG_STATUS_HEARTBEATS) {
      await logger.info("status.sent", {
        pcName: status.pcName,
        cpuPercent: status.cpuPercent,
        ramUsedPercent: status.ramUsedPercent,
        diskUsedPercent: status.diskUsedPercent
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown status error.";
    console.error(`Failed to collect PC status: ${message}`);
    await logger.error("status.failed", { message });
  }
}

socket.on("connect", () => {
  console.info(`Agent connected to ${env.SERVER_URL} as ${env.PC_NAME}.`);
  void logger.info("socket.connected", {
    serverUrl: env.SERVER_URL,
    pcName: env.PC_NAME,
    socketId: socket.id,
    statusIntervalMs: env.STATUS_INTERVAL_MS,
    powerCommandsEnabled: env.POWER_COMMANDS_ENABLED
  });
  void emitStatus();
});

socket.on("disconnect", (reason) => {
  console.warn(`Agent disconnected: ${reason}`);
  void logger.warn("socket.disconnected", { reason });
});

socket.on("connect_error", (error) => {
  console.error(`Agent connection error: ${error.message}`);
  void logger.error("socket.connect_error", { message: error.message });
});

socket.on("server:command", async (payload, acknowledge) => {
  const startedAt = Date.now();
  await logger.info("command.received", {
    commandId: typeof payload?.id === "string" ? payload.id : undefined,
    command: typeof payload?.command === "string" ? payload.command : undefined,
    source: typeof payload?.source === "string" ? payload.source : undefined,
    requestedBy: typeof payload?.requestedBy === "string" ? payload.requestedBy : undefined
  });

  const result = await executeCommand(env, payload);
  acknowledge(result);

  await logger.info("command.completed", {
    commandId: result.id,
    command: result.command,
    status: result.status,
    message: result.message,
    error: result.error,
    durationMs: Date.now() - startedAt,
    hasScreenshot: Boolean(result.data?.screenshotBase64)
  });

  if (result.data?.pcStatus) {
    socket.emit("agent:status", result.data.pcStatus);
    await logger.saveLatestStatus(result.data.pcStatus);
  }
});

setInterval(() => {
  if (socket.connected) {
    void emitStatus();
  }
}, env.STATUS_INTERVAL_MS);

void logger.info("agent.started", {
  serverUrl: env.SERVER_URL,
  pcName: env.PC_NAME,
  logDir: env.LOG_DIR,
  statusIntervalMs: env.STATUS_INTERVAL_MS
});

process.on("SIGINT", () => {
  void logger.warn("agent.stopping", { signal: "SIGINT" }).finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void logger.warn("agent.stopping", { signal: "SIGTERM" }).finally(() => process.exit(0));
});
