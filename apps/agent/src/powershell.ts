import { execFile } from "node:child_process";

export interface PowerShellResult {
  stdout: string;
  stderr: string;
}

export function runPowerShell(script: string, timeoutMs = 30_000): Promise<PowerShellResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 30 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    );
  });
}
