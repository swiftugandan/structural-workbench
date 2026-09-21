import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    trace: "on",
    screenshot: "only-on-failure",
    launchOptions: {
      args:
        process.env.WORKBENCH_REAL_GPU === "1"
          ? []
          : ["--enable-unsafe-webgpu", "--use-angle=swiftshader"],
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
        outputFile: `${process.env.WORKBENCH_EVIDENCE_DIR || "evidence/M00/current"}/playwright-results.json`,
      },
    ],
  ],
});
