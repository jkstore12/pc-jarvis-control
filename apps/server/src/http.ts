import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { isAllowedCommand, isDangerousCommand, type CommandName } from "@pc-jarvis/shared";
import type { AgentHub } from "./agent-hub.js";
import type { AuthenticatedRequest, createAuth } from "./auth.js";
import type { CommandService } from "./command-service.js";
import type { CommandLogStore } from "./log-store.js";

type Auth = ReturnType<typeof createAuth>;

export interface HttpContext {
  corsOrigins: string[];
  auth: Auth;
  agentHub: AgentHub;
  commandService: CommandService;
  logs: CommandLogStore;
  dangerousConfirmationPhrase: string;
  loginRateLimitWindowMs: number;
  loginRateLimitMax: number;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const commandBodySchema = z.object({
  confirmation: z.string().optional(),
  volume: z.number().optional()
});

export function createApp(ctx: HttpContext) {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || ctx.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true
  }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, agentOnline: ctx.agentHub.isOnline() });
  });

  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: ctx.loginRateLimitWindowMs,
      limit: ctx.loginRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many login attempts. Try again later." }
    }),
    async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid login payload." });
      return;
    }

    const token = await ctx.auth.login(parsed.data.email, parsed.data.password);
    if (!token) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    res.json({ token, user: { email: parsed.data.email } });
    }
  );

  app.use("/api", ctx.auth.middleware);

  app.get("/api/me", (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      agentOnline: ctx.agentHub.isOnline(),
      status: ctx.agentHub.getLatestStatus()
    });
  });

  app.get("/api/commands/history", async (_req, res) => {
    res.json({ logs: await ctx.logs.list(50) });
  });

  app.post("/api/commands/:command", async (req: AuthenticatedRequest, res) => {
    const commandParam = req.params.command;
    if (typeof commandParam !== "string" || !isAllowedCommand(commandParam)) {
      res.status(400).json({ error: "Command is not allowed." });
      return;
    }

    const command = commandParam as CommandName;
    const parsed = commandBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid command payload." });
      return;
    }

    const confirmed = isDangerousCommand(command)
      ? parsed.data.confirmation === ctx.dangerousConfirmationPhrase
      : true;

    const result = await ctx.commandService.execute({
      command,
      source: "web",
      requestedBy: req.user?.email ?? "unknown",
      confirmed,
      args: { volume: parsed.data.volume }
    });

    const statusCode = result.status === "rejected" ? 403 : result.status === "failed" ? 502 : 200;
    res.status(statusCode).json(result);
  });

  return app;
}
