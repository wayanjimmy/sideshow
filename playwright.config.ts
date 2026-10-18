import { defineConfig, devices } from "@playwright/test";

// Viewer e2e suite — runs with `npm run test:e2e`, kept out of `npm test`.
// WebKit is the point: the iframe resize bridge has WebKit-specific quirks
// (see CLAUDE.md), so both engines must pass.

// Playwright 1.60 doesn't know ubuntu 26.04, so its downloader refuses to
// install here. When the managed browsers aren't available, fall back to the
// system engines via PW_CHROMIUM / PW_WEBKIT (snap chromium / webkit flatpak).
const systemChromium = process.env.PW_CHROMIUM;
const systemWebkit = process.env.PW_WEBKIT;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/globalSetup.ts",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: systemChromium ? { executablePath: systemChromium } : {},
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        launchOptions: systemWebkit ? { executablePath: systemWebkit } : {},
      },
    },
  ],
});
