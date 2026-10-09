import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the real API (offline fake AI, fresh SQLite DB) serving the built web app.
 * Build first: `npm run build`. Then `npm run e2e`.
 */
const PORT = 8765;
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: chromium ? { executablePath: chromium } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `bash -c "cd ../api && rm -f mahaguru-e2e.db* && uv run alembic upgrade head && uv run uvicorn app.main:app --port ${PORT}"`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ENV: 'test',
      LLM_PROVIDER: 'fake',
      DATABASE_URL: 'sqlite+aiosqlite:///./mahaguru-e2e.db',
      VALIDATE_RESOURCE_LINKS: 'false',
      WEB_DIST_DIR: '../web/dist',
    },
  },
});
