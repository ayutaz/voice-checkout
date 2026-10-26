import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:47136/voice-checkout/",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.js",
    url: "http://127.0.0.1:47136/voice-checkout/",
    env: { PORT: "47136", BASE_PATH: "/voice-checkout/" },
    reuseExistingServer: false,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
