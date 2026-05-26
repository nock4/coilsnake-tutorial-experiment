import { defineConfig } from "@playwright/test";
import { devices as replayDevices, replayReporter } from "@replayio/playwright";

export default defineConfig({
  testDir: "tests/replay",
  timeout: 30_000,
  reporter: [
    replayReporter({
      apiKey: process.env.REPLAY_API_KEY,
      upload: Boolean(process.env.REPLAY_API_KEY)
    }),
    ["line"]
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  projects: [
    {
      name: "replay-chromium",
      use: {
        ...replayDevices["Replay Chromium"],
        baseURL: "http://127.0.0.1:5173/",
        viewport: { width: 1000, height: 760 }
      }
    }
  ]
});
