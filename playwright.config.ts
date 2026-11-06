import { defineConfig } from "@playwright/test";

const port = Number(process.env.HANSAN_E2E_PORT ?? 43173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_BROWSER ?? "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: {
      HANSAN_E2E_PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
      ...(process.env.HANSAN_E2E_RUNTIME_ROOT
        ? { HANSAN_E2E_RUNTIME_ROOT: process.env.HANSAN_E2E_RUNTIME_ROOT }
        : {}),
      ...(process.env.HANSAN_DEMO_PASSWORD
        ? { HANSAN_DEMO_PASSWORD: process.env.HANSAN_DEMO_PASSWORD }
        : {}),
    },
  },
});
