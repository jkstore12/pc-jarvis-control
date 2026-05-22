import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentHub } from "../src/agent-hub.js";
import { createAuth } from "../src/auth.js";
import { CommandService } from "../src/command-service.js";
import { createApp } from "../src/http.js";
import type { CommandLog } from "@pc-jarvis/shared";
import type { CommandLogStore } from "../src/log-store.js";

class TestLogStore implements CommandLogStore {
  logs: CommandLog[] = [];

  async create(log: CommandLog) {
    this.logs.push(log);
  }

  async update(id: string, patch: Partial<CommandLog>) {
    this.logs = this.logs.map((log) => (log.id === id ? { ...log, ...patch } : log));
  }

  async list() {
    return this.logs;
  }
}

describe("HTTP API", () => {
  const password = "jarvis-pass";
  let passwordHash = "";

  beforeEach(async () => {
    passwordHash = await bcrypt.hash(password, 10);
  });

  it("rejects protected routes without JWT", async () => {
    const agentHub = new AgentHub();
    const logs = new TestLogStore();
    const app = createApp({
      corsOrigins: ["http://localhost:5173"],
      auth: createAuth({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD_HASH: passwordHash,
        JWT_SECRET: "test-secret-test-secret-test-secret-123"
      }),
      agentHub,
      logs,
      commandService: new CommandService(agentHub, logs),
      dangerousConfirmationPhrase: "CONFIRMAR",
      loginRateLimitWindowMs: 60_000,
      loginRateLimitMax: 100
    });

    await request(app).get("/api/me").expect(401);
  });

  it("logs in and returns current status", async () => {
    const agentHub = new AgentHub();
    const logs = new TestLogStore();
    const app = createApp({
      corsOrigins: ["http://localhost:5173"],
      auth: createAuth({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD_HASH: passwordHash,
        JWT_SECRET: "test-secret-test-secret-test-secret-123"
      }),
      agentHub,
      logs,
      commandService: new CommandService(agentHub, logs),
      dangerousConfirmationPhrase: "CONFIRMAR",
      loginRateLimitWindowMs: 60_000,
      loginRateLimitMax: 100
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password })
      .expect(200);

    await request(app)
      .get("/api/status")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.agentOnline).toBe(false);
      });
  });

  it("rejects dangerous commands without confirmation", async () => {
    const agentHub = new AgentHub();
    const logs = new TestLogStore();
    vi.spyOn(agentHub, "sendCommand");
    const app = createApp({
      corsOrigins: ["http://localhost:5173"],
      auth: createAuth({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD_HASH: passwordHash,
        JWT_SECRET: "test-secret-test-secret-test-secret-123"
      }),
      agentHub,
      logs,
      commandService: new CommandService(agentHub, logs),
      dangerousConfirmationPhrase: "CONFIRMAR",
      loginRateLimitWindowMs: 60_000,
      loginRateLimitMax: 100
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password })
      .expect(200);

    await request(app)
      .post("/api/commands/shutdown")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({})
      .expect(403);

    expect(agentHub.sendCommand).not.toHaveBeenCalled();
  });
});
