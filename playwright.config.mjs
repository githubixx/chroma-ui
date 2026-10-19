import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    testMatch: '**/*.spec.mjs',
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    outputDir: './test-results/artifacts',
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/html' }]],
    use: {
        baseURL: 'http://127.0.0.1:18764',
        viewport: { width: 1440, height: 1000 },
        locale: 'en-GB',
        colorScheme: 'light',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: ['--disable-gpu'] } } },
        { name: 'firefox', use: { browserName: 'firefox' } },
    ],
    webServer: {
        command: process.env.E2E_SERVER_COMMAND || 'go run ./examples/showcase -assets-prefix /demo/skin',
        url: 'http://127.0.0.1:18764/',
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
