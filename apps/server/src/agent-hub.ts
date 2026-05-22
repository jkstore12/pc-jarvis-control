import { EventEmitter } from "node:events";
import type { Socket } from "socket.io";
import type { CommandRequestPayload, CommandResultPayload, PcStatus } from "@pc-jarvis/shared";

export class AgentHub extends EventEmitter {
  private agentSocket: Socket | null = null;
  private latestStatus: PcStatus | null = null;

  attach(socket: Socket) {
    this.agentSocket = socket;
    this.emit("agent:online");

    socket.on("agent:status", (status: PcStatus) => {
      this.latestStatus = { ...status, online: true };
      this.emit("status", this.latestStatus);
    });

    socket.on("disconnect", () => {
      if (this.agentSocket?.id === socket.id) {
        this.agentSocket = null;
        if (this.latestStatus) {
          this.latestStatus = { ...this.latestStatus, online: false, updatedAt: new Date().toISOString() };
          this.emit("status", this.latestStatus);
        }
        this.emit("agent:offline");
      }
    });
  }

  isOnline(): boolean {
    return Boolean(this.agentSocket?.connected);
  }

  getLatestStatus(): PcStatus | null {
    return this.latestStatus;
  }

  async sendCommand(payload: CommandRequestPayload): Promise<CommandResultPayload> {
    if (!this.agentSocket?.connected) {
      throw new Error("No Windows agent is connected.");
    }

    return new Promise((resolve, reject) => {
      this.agentSocket?.timeout(45_000).emit("server:command", payload, (error: Error | null, result?: CommandResultPayload) => {
        if (error) {
          reject(new Error("Agent did not acknowledge the command in time."));
          return;
        }

        if (!result) {
          reject(new Error("Agent returned an empty response."));
          return;
        }

        if (result.data?.pcStatus) {
          this.latestStatus = result.data.pcStatus;
          this.emit("status", this.latestStatus);
        }

        resolve(result);
      });
    });
  }
}
