import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const database = path.join(
  process.cwd(),
  ".test-data",
  `e2e-${process.pid}.db`,
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "mobile-chromium",
      testMatch: ["responsive-ui.spec.ts", "settings.spec.ts"],
      grepInvert: /鍵盤可跳過導覽/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      testMatch: ["responsive-ui.spec.ts", "settings.spec.ts"],
      grepInvert: /鍵盤可跳過導覽/,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      FINANCE_REVIEW_DB_PATH: database,
      NEXT_DIST_DIR: ".next-e2e",
    },
    timeout: 120_000,
  },
  globalSetup: "./e2e/setup.ts",
  globalTeardown: "./e2e/teardown.ts",
});
