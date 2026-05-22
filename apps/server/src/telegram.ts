import TelegramBot from "node-telegram-bot-api";
import { isAllowedCommand, isDangerousCommand, type CommandName, type PcStatus } from "@pc-jarvis/shared";
import { parseAllowedTelegramUsers, type ServerEnv } from "./env.js";
import type { AgentHub } from "./agent-hub.js";
import type { CommandService } from "./command-service.js";

interface PendingConfirmation {
  command: CommandName;
  code: string;
  expiresAt: number;
}

const commandMap: Record<string, CommandName> = {
  "/status": "status",
  "/screenshot": "screenshot",
  "/open_chrome": "open_chrome",
  "/open_vscode": "open_vscode",
  "/shutdown": "shutdown",
  "/restart": "restart"
};

function formatStatus(status: PcStatus | null, agentOnline: boolean): string {
  if (!status) {
    return `PC ${agentOnline ? "online" : "offline"}; aguardando primeiro status do agente.`;
  }

  return [
    `PC: ${status.pcName}`,
    `Online: ${agentOnline ? "sim" : "nao"}`,
    `CPU: ${status.cpuPercent}%`,
    `RAM: ${status.ramUsedPercent}% (${status.ramUsedGb}/${status.ramTotalGb} GB)`,
    `Disco: ${status.diskUsedPercent}% (${status.diskFreeGb}/${status.diskTotalGb} GB livres)`,
    `Atualizado: ${status.updatedAt}`
  ].join("\n");
}

export function startTelegramBot(env: ServerEnv, agentHub: AgentHub, commandService: CommandService) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.info("Telegram bot disabled. TELEGRAM_BOT_TOKEN is not configured.");
    return null;
  }

  const allowedUsers = parseAllowedTelegramUsers(env.TELEGRAM_ALLOWED_USER_IDS);
  const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
  const pending = new Map<string, PendingConfirmation>();

  function isAllowedUser(userId: number | undefined): boolean {
    return Boolean(userId && allowedUsers.has(String(userId)));
  }

  bot.onText(/\/start|\/help/, (message) => {
    if (!isAllowedUser(message.from?.id)) {
      void bot.sendMessage(message.chat.id, "Acesso negado.");
      return;
    }

    void bot.sendMessage(
      message.chat.id,
      ["/status", "/screenshot", "/open_chrome", "/open_vscode", "/shutdown", "/restart"].join("\n")
    );
  });

  bot.on("message", async (message) => {
    const chatId = message.chat.id;
    const userId = message.from?.id;
    const text = message.text?.trim();

    if (!text || text === "/start" || text === "/help") {
      return;
    }

    if (!isAllowedUser(userId)) {
      await bot.sendMessage(chatId, "Acesso negado.");
      return;
    }

    const pendingConfirmation = pending.get(String(chatId));
    if (pendingConfirmation && text === pendingConfirmation.code && pendingConfirmation.expiresAt > Date.now()) {
      pending.delete(String(chatId));
      const result = await commandService.execute({
        command: pendingConfirmation.command,
        source: "telegram",
        requestedBy: String(userId),
        confirmed: true
      });
      await bot.sendMessage(chatId, result.message);
      return;
    }

    const command = commandMap[text];
    if (!command || !isAllowedCommand(command)) {
      return;
    }

    if (command === "status") {
      await bot.sendMessage(chatId, formatStatus(agentHub.getLatestStatus(), agentHub.isOnline()));
      return;
    }

    if (isDangerousCommand(command)) {
      const code = `${command.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
      pending.set(String(chatId), { command, code, expiresAt: Date.now() + 60_000 });
      await bot.sendMessage(chatId, `Confirme enviando exatamente: ${code}`);
      return;
    }

    const result = await commandService.execute({
      command,
      source: "telegram",
      requestedBy: String(userId),
      confirmed: true
    });

    if (result.data?.screenshotBase64) {
      await bot.sendPhoto(chatId, Buffer.from(result.data.screenshotBase64, "base64"), {
        caption: result.message
      });
      return;
    }

    await bot.sendMessage(chatId, result.message);
  });

  console.info("Telegram bot started in polling mode.");
  return bot;
}
