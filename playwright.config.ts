import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the MacTuxel frontend in WebKit (the engine behind
 * macOS WKWebView, which Tauri uses) against the Vite dev server.
 * Native Tauri calls are guarded by `isTauri()` and are no-ops here.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
