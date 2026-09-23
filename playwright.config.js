import { defineConfig } from "@playwright/test";
const realGpu = process.env.WORKBENCH_REAL_GPU === "1";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  testIgnore:
    process.env.WORKBENCH_LIVE_VISUAL === "1"
      ? []
      : ["**/live-visual.spec.js"],
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    trace: "on",
    screenshot: "only-on-failure",
    ...(realGpu ? { channel: "chrome" } : {}),
    launchOptions: {
      args: realGpu
        ? ["--enable-unsafe-webgpu"]
        : ["--enable-unsafe-webgpu", "--use-angle=swiftshader"],
      headless: process.env.WORKBENCH_LIVE_VISUAL === "1" ? false : undefined,
    },
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
  reporter: [
    ["list"],
    [
      "json",
      {
        // Live-visual must not overwrite the browser-suite reporter artifact.
        outputFile: `${process.env.WORKBENCH_EVIDENCE_DIR || "evidence/M00/current"}/${
          process.env.WORKBENCH_LIVE_VISUAL === "1"
            ? "live-visual-playwright-results.json"
            : "playwright-results.json"
        }`,
      },
    ],
  ],
});
