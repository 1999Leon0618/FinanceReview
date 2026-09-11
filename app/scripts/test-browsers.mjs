import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(
  new URL("../node_modules/@playwright/test/cli.js", import.meta.url),
);
const projects = [
  "chromium",
  "firefox",
  "webkit",
  "mobile-chromium",
  "mobile-webkit",
];
const requested = process.argv.slice(2);
if (requested.some((project) => !projects.includes(project))) {
  console.error(`請指定測試環境：${projects.join(", ")}`);
  process.exit(1);
}
let failed = false;
// 每個環境獨立啟動 Playwright 與測試資料庫，避免上一輪快照影響下一輪。
for (const project of requested.length ? requested : projects) {
  console.log(`\n驗證瀏覽器：${project}`);
  const result = spawnSync(
    process.execPath,
    [cli, "test", `--project=${project}`, `--output=test-results/${project}`],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
