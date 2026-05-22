import {
  assertVolume,
  isAllowedCommand,
  type CommandName,
  type CommandRequestPayload,
  type CommandResultPayload,
  type PcStatus
} from "@pc-jarvis/shared";
import type { AgentEnv } from "./env.js";
import { runPowerShell } from "./powershell.js";

interface ParsedCommandPayload extends CommandRequestPayload {}

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

export async function getPcStatus(pcName: string): Promise<PcStatus> {
  const script = `
$ErrorActionPreference = "Stop"
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$totalRamGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRamGb = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedRamGb = [math]::Round($totalRamGb - $freeRamGb, 2)
$diskTotalGb = [math]::Round($disk.Size / 1GB, 2)
$diskFreeGb = [math]::Round($disk.FreeSpace / 1GB, 2)
$uptime = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
[pscustomobject]@{
  cpuPercent = [math]::Round([double]$cpu, 1)
  ramUsedGb = $usedRamGb
  ramTotalGb = $totalRamGb
  diskFreeGb = $diskFreeGb
  diskTotalGb = $diskTotalGb
  uptimeSeconds = $uptime
} | ConvertTo-Json -Compress
`;
  const { stdout } = await runPowerShell(script);
  const raw = JSON.parse(stdout) as Omit<PcStatus, "pcName" | "online" | "ramUsedPercent" | "diskUsedPercent" | "updatedAt">;
  const ramUsedPercent = raw.ramTotalGb > 0 ? round((raw.ramUsedGb / raw.ramTotalGb) * 100) : 0;
  const diskUsedPercent = raw.diskTotalGb > 0 ? round(((raw.diskTotalGb - raw.diskFreeGb) / raw.diskTotalGb) * 100) : 0;

  return {
    pcName,
    online: true,
    cpuPercent: raw.cpuPercent,
    ramUsedPercent,
    ramUsedGb: raw.ramUsedGb,
    ramTotalGb: raw.ramTotalGb,
    diskUsedPercent,
    diskFreeGb: raw.diskFreeGb,
    diskTotalGb: raw.diskTotalGb,
    uptimeSeconds: raw.uptimeSeconds,
    updatedAt: new Date().toISOString()
  };
}

async function takeScreenshot(): Promise<string> {
  const script = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
[Convert]::ToBase64String($stream.ToArray())
`;
  const { stdout } = await runPowerShell(script, 45_000);
  return stdout;
}

async function openChrome() {
  await runPowerShell(`
$ErrorActionPreference = "Stop"
$paths = @(
  "chrome.exe",
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "${"${env:ProgramFiles(x86)}"}\\Google\\Chrome\\Application\\chrome.exe"
)
foreach ($path in $paths) {
  try {
    Start-Process $path
    exit 0
  } catch {}
}
throw "Chrome executable not found."
`);
}

async function openVsCode() {
  await runPowerShell(`
$ErrorActionPreference = "Stop"
$paths = @(
  "code",
  "$env:LOCALAPPDATA\\Programs\\Microsoft VS Code\\Code.exe",
  "$env:ProgramFiles\\Microsoft VS Code\\Code.exe"
)
foreach ($path in $paths) {
  try {
    Start-Process $path
    exit 0
  } catch {}
}
throw "VS Code executable not found."
`);
}

async function setVolume(volume: number) {
  const safeVolume = assertVolume(volume);
  const steps = Math.round(safeVolume / 2);
  await runPowerShell(`
$ErrorActionPreference = "Stop"
$shell = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt 50; $i++) { $shell.SendKeys([char]174); Start-Sleep -Milliseconds 8 }
for ($i = 0; $i -lt ${steps}; $i++) { $shell.SendKeys([char]175); Start-Sleep -Milliseconds 8 }
`);
}

async function shutdownPc(enabled: boolean) {
  if (!enabled) {
    throw new Error("Power commands are disabled. Set POWER_COMMANDS_ENABLED=true in the agent environment.");
  }

  await runPowerShell(`Start-Process shutdown.exe -ArgumentList "/s /t 10 /c \\"PC Jarvis Control requested shutdown.\\""`);
}

async function restartPc(enabled: boolean) {
  if (!enabled) {
    throw new Error("Power commands are disabled. Set POWER_COMMANDS_ENABLED=true in the agent environment.");
  }

  await runPowerShell(`Start-Process shutdown.exe -ArgumentList "/r /t 10 /c \\"PC Jarvis Control requested restart.\\""`);
}

function parseCommandPayload(payload: unknown): ParsedCommandPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<CommandRequestPayload>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.command !== "string" ||
    !isAllowedCommand(candidate.command) ||
    typeof candidate.source !== "string" ||
    typeof candidate.requestedBy !== "string"
  ) {
    return null;
  }

  const parsed: ParsedCommandPayload = {
    id: candidate.id,
    command: candidate.command,
    source: candidate.source === "telegram" || candidate.source === "system" ? candidate.source : "web",
    requestedBy: candidate.requestedBy
  };

  if (candidate.args?.volume !== undefined) {
    parsed.args = { volume: assertVolume(candidate.args.volume) };
  }

  return parsed;
}

function rejectedResult(id: string, command: CommandName, message: string): CommandResultPayload {
  return {
    id,
    command,
    status: "rejected",
    message,
    error: message
  };
}

export async function executeCommand(env: AgentEnv, unsafePayload: unknown): Promise<CommandResultPayload> {
  let payload: ParsedCommandPayload | null = null;

  try {
    payload = parseCommandPayload(unsafePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid command payload received by the local agent.";
    return {
      id: "invalid-payload",
      command: "status",
      status: "rejected",
      message,
      error: message
    };
  }

  if (!payload) {
    return {
      id: "invalid-payload",
      command: "status",
      status: "rejected",
      message: "Invalid command payload received by the local agent.",
      error: "Invalid command payload received by the local agent."
    };
  }

  if (!isAllowedCommand(payload.command)) {
    return rejectedResult(payload.id, payload.command, "Command is not allowed by the local agent.");
  }

  try {
    switch (payload.command) {
      case "status": {
        const pcStatus = await getPcStatus(env.PC_NAME);
        return {
          id: payload.id,
          command: payload.command,
          status: "success",
          message: "Status updated.",
          data: { pcStatus }
        };
      }
      case "screenshot": {
        const screenshotBase64 = await takeScreenshot();
        return {
          id: payload.id,
          command: payload.command,
          status: "success",
          message: "Screenshot captured.",
          data: { screenshotBase64, screenshotMimeType: "image/png" }
        };
      }
      case "open_chrome":
        await openChrome();
        return { id: payload.id, command: payload.command, status: "success", message: "Chrome opened." };
      case "open_vscode":
        await openVsCode();
        return { id: payload.id, command: payload.command, status: "success", message: "VS Code opened." };
      case "set_volume":
        await setVolume(payload.args?.volume ?? 50);
        return { id: payload.id, command: payload.command, status: "success", message: `Volume set to ${payload.args?.volume ?? 50}%.` };
      case "shutdown":
        await shutdownPc(env.POWER_COMMANDS_ENABLED);
        return { id: payload.id, command: payload.command, status: "success", message: "Shutdown scheduled in 10 seconds." };
      case "restart":
        await restartPc(env.POWER_COMMANDS_ENABLED);
        return { id: payload.id, command: payload.command, status: "success", message: "Restart scheduled in 10 seconds." };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed.";
    return {
      id: payload.id,
      command: payload.command,
      status: "failed",
      message,
      error: message
    };
  }
}
