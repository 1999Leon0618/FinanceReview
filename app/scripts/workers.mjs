import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const [command, ...args] = process.argv.slice(2);
const commands = {
  build: ["vinext/dist/cli.js", "build"],
  dev: [
    "vinext/dist/cli.js",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3106",
  ],
  preview: [
    "wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "3107",
  ],
  "migrate:local": [
    "wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
  ],
  "migrate:production": [
    "wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--env",
    "production",
  ],
  "deploy:production": [
    "@vinext/cloudflare/dist/cli.js",
    "deploy",
    "--env",
    "production",
  ],
};
if (!Object.hasOwn(commands, command))
  throw new Error(
    "請指定 build、dev、preview、migrate:local、migrate:production 或 deploy:production。",
  );
const [entry, ...defaults] = commands[command];
const child = spawn(
  process.execPath,
  [path.join(root, "node_modules", entry), ...defaults, ...args],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: path.join(root, ".wrangler", "logs"),
    },
  },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (command !== "build") {
    process.exitCode = code ?? 1;
    return;
  }
  // vinext beta 會覆寫 .next/types/routes.d.ts；建置後重新產生 Next.js 型別。
  const typegen = spawn(
    process.execPath,
    [path.join(root, "node_modules/next/dist/bin/next"), "typegen"],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  typegen.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  typegen.on("exit", (typeCode) => {
    process.exitCode = (code ?? 1) || (typeCode ?? 1);
  });
});
