import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun run --filter @incident-commander/api start",
      url: "http://localhost:3000/api/v1/health",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 60_000,
    },
    {
      command: "bun run --filter @incident-commander/web dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 60_000,
    },
  ],
});
