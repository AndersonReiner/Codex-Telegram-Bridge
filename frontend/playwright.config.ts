import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8791",
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: "node test/fixtures/settings-server.mjs",
    cwd: "..",
    url: "http://127.0.0.1:8791/health",
    reuseExistingServer: false,
  },
});
