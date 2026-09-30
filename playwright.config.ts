import { defineConfig, devices } from "@playwright/test";

const LOCAL_MONGO = "mongodb://127.0.0.1:27018";
process.env.MONGODB_URI ??= LOCAL_MONGO;

export const ORIGIN = "http://127.0.0.1:3100";

export default defineConfig({
    testDir: "e2e",
    globalSetup: "./e2e/global-setup.ts",
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
    use: { baseURL: ORIGIN, trace: "on-first-retry" },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        { name: "pixel-7", use: { ...devices["Pixel 7"] } },
        { name: "iphone-15", use: { ...devices["iPhone 15"] } },
    ],
    webServer: {
        command: process.env.CI ? "npm run start -- -p 3100" : "npm run build && npm run start -- -p 3100",
        url: `${ORIGIN}/api/health`,
        timeout: 300_000,
        reuseExistingServer: false,
        env: {
            MONGODB_URI: process.env.MONGODB_URI,
            MARKET_DATA_API_TOKEN: "",
            WEATHER_API_KEY: "",
            PINECONE_API_KEY: "",
            PINECONE_INDEX_HOST: "",
        },
    },
});
