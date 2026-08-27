import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

async function run(command: string, args: string[]) {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec ?? "cmd.exe";
    return execFileAsync(shell, ["/d", "/s", "/c", command, ...args], {
      timeout: 8_000,
      windowsHide: true,
    });
  }
  return execFileAsync(command, args, { timeout: 8_000, windowsHide: true });
}

export async function GET() {
  const [openClaw, models, running] = await Promise.allSettled([
    run(process.platform === "win32" ? "openclaw.cmd" : "openclaw", [
      "--version",
    ]),
    run(process.platform === "win32" ? "ollama.exe" : "ollama", ["list"]),
    run(process.platform === "win32" ? "ollama.exe" : "ollama", ["ps"]),
  ]);
  const openClawReady = openClaw.status === "fulfilled";
  const modelInstalled =
    models.status === "fulfilled" && models.value.stdout.includes("gemma4:26b");
  const modelLoaded =
    running.status === "fulfilled" &&
    running.value.stdout.includes("gemma4:26b");
  return NextResponse.json({
    available: openClawReady && modelInstalled,
    openClawReady,
    modelInstalled,
    modelLoaded,
    model: "gemma4:26b",
  });
}
