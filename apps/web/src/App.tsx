import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  Camera,
  Chrome,
  Code2,
  Cpu,
  HardDrive,
  History,
  LogOut,
  MemoryStick,
  Monitor,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Volume2
} from "lucide-react";
import type { CommandLog, CommandName, PcStatus } from "@pc-jarvis/shared";

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;
const CONFIRMATION_PHRASE = "CONFIRMAR";

interface StatusResponse {
  agentOnline: boolean;
  status: PcStatus | null;
}

type DangerousAction = Extract<CommandName, "shutdown" | "restart">;

function formatUptime(seconds?: number) {
  if (!seconds) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("jarvis_token") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [status, setStatus] = useState<PcStatus | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [busyCommand, setBusyCommand] = useState<CommandName | null>(null);
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [volume, setVolume] = useState(50);
  const [dangerousAction, setDangerousAction] = useState<DangerousAction | null>(null);

  const socket: Socket | null = useMemo(() => {
    if (!token) return null;
    return io(API_URL, {
      auth: { role: "web", token }
    });
  }, [token]);

  async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, options);
    const data = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      throw new Error(data.error ?? "Request failed.");
    }

    return data;
  }

  async function refresh() {
    if (!token) return;
    const [statusResponse, historyResponse] = await Promise.all([
      fetchJson<StatusResponse>("/api/status", { headers: authHeaders(token) }),
      fetchJson<{ logs: CommandLog[] }>("/api/commands/history", { headers: authHeaders(token) })
    ]);

    setAgentOnline(statusResponse.agentOnline);
    setStatus(statusResponse.status);
    setLogs(historyResponse.logs);
  }

  useEffect(() => {
    if (!token) return;
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Falha ao carregar dados."));
  }, [token]);

  useEffect(() => {
    if (!socket) return;

    socket.on("pc:status", (nextStatus: PcStatus) => {
      setStatus(nextStatus);
      setAgentOnline(nextStatus.online);
    });

    socket.on("connect_error", (error) => {
      setMessage(error.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoginError("");

    try {
      const response = await fetchJson<{ token: string }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem("jarvis_token", response.token);
      setToken(response.token);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    }
  }

  async function runCommand(command: CommandName, body: Record<string, unknown> = {}) {
    if (!token) return;
    setBusyCommand(command);
    setMessage("");

    try {
      const result = await fetchJson<{
        message: string;
        data?: { screenshotBase64?: string; screenshotMimeType?: string };
      }>(`/api/commands/${command}`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body)
      });

      setMessage(result.message);
      if (result.data?.screenshotBase64) {
        setScreenshot(`data:${result.data.screenshotMimeType ?? "image/png"};base64,${result.data.screenshotBase64}`);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Command failed.");
    } finally {
      setBusyCommand(null);
    }
  }

  function logout() {
    localStorage.removeItem("jarvis_token");
    setToken("");
    setStatus(null);
    setLogs([]);
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-8 text-slate-950">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Monitor aria-hidden size={24} />
            </div>
            <h1 className="text-3xl font-semibold">PC Jarvis Control</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Acesse seu painel seguro para comandar o PC Windows conectado.</p>
          </div>

          <form onSubmit={login} className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-slate-300 px-3 outline-none ring-sky-500 focus:ring-2"
              autoComplete="email"
              required
            />

            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-slate-300 px-3 outline-none ring-sky-500 focus:ring-2"
              autoComplete="current-password"
              required
            />

            {loginError && <p className="mt-3 text-sm text-red-600">{loginError}</p>}

            <button className="mt-5 h-12 w-full rounded-md bg-slate-950 font-medium text-white transition hover:bg-slate-800" type="submit">
              Entrar
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">PC Jarvis</h1>
            <p className="text-xs text-slate-500">{agentOnline ? "Agente online" : "Agente offline"}</p>
          </div>
          <div className="flex gap-2">
            <IconButton label="Atualizar" onClick={() => void refresh()} icon={<RefreshCw size={18} />} />
            <IconButton label="Sair" onClick={logout} icon={<LogOut size={18} />} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={<Cpu size={20} />} label="CPU" value={`${status?.cpuPercent ?? 0}%`} />
            <Metric icon={<MemoryStick size={20} />} label="RAM" value={`${status?.ramUsedPercent ?? 0}%`} detail={status ? `${status.ramUsedGb}/${status.ramTotalGb} GB` : "--"} />
            <Metric icon={<HardDrive size={20} />} label="Disco C:" value={`${status?.diskUsedPercent ?? 0}%`} detail={status ? `${status.diskFreeGb} GB livres` : "--"} />
            <Metric icon={<Monitor size={20} />} label="Uptime" value={formatUptime(status?.uptimeSeconds)} detail={status?.pcName ?? "Windows PC"} />
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="grid grid-cols-2 gap-3">
              <ActionButton command="screenshot" busyCommand={busyCommand} icon={<Camera size={19} />} label="Screenshot" onClick={() => void runCommand("screenshot")} />
              <ActionButton command="open_chrome" busyCommand={busyCommand} icon={<Chrome size={19} />} label="Chrome" onClick={() => void runCommand("open_chrome")} />
              <ActionButton command="open_vscode" busyCommand={busyCommand} icon={<Code2 size={19} />} label="VS Code" onClick={() => void runCommand("open_vscode")} />
              <ActionButton command="restart" busyCommand={busyCommand} icon={<RotateCcw size={19} />} label="Reiniciar" onClick={() => setDangerousAction("restart")} danger />
              <button
                className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-md bg-red-600 px-3 text-sm font-medium text-white transition hover:bg-red-700"
                onClick={() => setDangerousAction("shutdown")}
                type="button"
              >
                <Power size={19} />
                Desligar PC
              </button>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-700">
                <span className="flex items-center gap-2">
                  <Volume2 size={18} />
                  Volume
                </span>
                <span>{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                onPointerUp={() => void runCommand("set_volume", { volume })}
                className="w-full accent-emerald-600"
              />
            </div>
          </div>

          {message && <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{message}</p>}

          {screenshot && (
            <figure className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
              <img src={screenshot} alt="Screenshot capturada do PC" className="w-full" />
            </figure>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <History size={19} />
            <h2 className="font-semibold">Histórico</h2>
          </div>
          <div className="space-y-3">
            {logs.length === 0 && <p className="text-sm text-slate-500">Nenhum comando registrado.</p>}
            {logs.map((log) => (
              <div key={log.id} className="rounded-md border border-slate-200 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{log.command}</span>
                  <span className={`rounded px-2 py-1 text-xs ${statusClass(log.status)}`}>{log.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                {log.resultSummary && <p className="mt-2 text-sm text-slate-600">{log.resultSummary}</p>}
                {log.errorMessage && <p className="mt-2 text-sm text-red-600">{log.errorMessage}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {dangerousAction && (
        <div className="fixed inset-0 z-20 flex items-end bg-slate-950/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center gap-3 text-red-700">
              <ShieldAlert size={24} />
              <h2 className="text-lg font-semibold">{dangerousAction === "shutdown" ? "Desligar PC" : "Reiniciar PC"}</h2>
            </div>
            <p className="text-sm leading-6 text-slate-600">Digite {CONFIRMATION_PHRASE} para confirmar esta ação.</p>
            <ConfirmDanger
              onCancel={() => setDangerousAction(null)}
              onConfirm={(confirmation) => {
                const action = dangerousAction;
                setDangerousAction(null);
                void runCommand(action, { confirmation });
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between text-slate-500">
        {icon}
        <span className="text-xs font-medium uppercase">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 min-h-5 text-xs text-slate-500">{detail ?? ""}</p>
    </div>
  );
}

function IconButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
    >
      {icon}
    </button>
  );
}

function ActionButton({
  command,
  busyCommand,
  icon,
  label,
  onClick,
  danger = false
}: {
  command: CommandName;
  busyCommand: CommandName | null;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const busy = busyCommand === command;
  return (
    <button
      className={`flex h-12 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${
        danger ? "bg-amber-500 text-slate-950 hover:bg-amber-400" : "bg-slate-950 text-white hover:bg-slate-800"
      } disabled:cursor-wait disabled:opacity-70`}
      disabled={busy}
      onClick={onClick}
      type="button"
    >
      {icon}
      {busy ? "Aguarde" : label}
    </button>
  );
}

function ConfirmDanger({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="mt-4">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-12 w-full rounded-md border border-slate-300 px-3 outline-none ring-red-500 focus:ring-2"
        autoFocus
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className="h-11 rounded-md border border-slate-300 font-medium text-slate-700" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="h-11 rounded-md bg-red-600 font-medium text-white" onClick={() => onConfirm(value)} type="button">
          Confirmar
        </button>
      </div>
    </div>
  );
}

function statusClass(status: CommandLog["status"]) {
  switch (status) {
    case "success":
      return "bg-emerald-100 text-emerald-800";
    case "failed":
      return "bg-red-100 text-red-800";
    case "rejected":
      return "bg-amber-100 text-amber-900";
    case "running":
      return "bg-sky-100 text-sky-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
