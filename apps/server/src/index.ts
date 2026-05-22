import http from "node:http";
import { Server } from "socket.io";
import { loadEnv } from "./env.js";
import { createAuth } from "./auth.js";
import { AgentHub } from "./agent-hub.js";
import { CommandService } from "./command-service.js";
import { createCommandLogStore } from "./log-store.js";
import { createApp } from "./http.js";
import { startTelegramBot } from "./telegram.js";
import { serveStaticWeb } from "./static-web.js";
import { parseCorsOrigins } from "./env.js";

const env = loadEnv();
const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);
const auth = createAuth(env);
const agentHub = new AgentHub();
const logs = createCommandLogStore(env);
const commandService = new CommandService(agentHub, logs);
const app = createApp({
  corsOrigins,
  auth,
  agentHub,
  commandService,
  logs,
  dangerousConfirmationPhrase: env.DANGEROUS_CONFIRMATION_PHRASE,
  loginRateLimitWindowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX
});

if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true
  }
});

io.use((socket, next) => {
  const role = socket.handshake.auth.role;

  if (role === "agent") {
    if (socket.handshake.auth.token !== env.AGENT_SECRET) {
      next(new Error("Invalid agent token."));
      return;
    }

    socket.data.role = "agent";
    next();
    return;
  }

  if (role === "web") {
    const token = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : "";
    const user = auth.verify(token);
    if (!user) {
      next(new Error("Invalid web token."));
      return;
    }

    socket.data.role = "web";
    socket.data.user = user;
    next();
    return;
  }

  next(new Error("Unknown socket role."));
});

io.on("connection", (socket) => {
  if (socket.data.role === "agent") {
    agentHub.attach(socket);
    return;
  }

  socket.join("web");
  const status = agentHub.getLatestStatus();
  if (status) {
    socket.emit("pc:status", status);
  }
});

agentHub.on("status", (status) => {
  io.to("web").emit("pc:status", status);
});

startTelegramBot(env, agentHub, commandService);
serveStaticWeb(app, env.STATIC_WEB_DIR);

server.listen(env.PORT, () => {
  console.info(`PC Jarvis server listening on port ${env.PORT}.`);
});
