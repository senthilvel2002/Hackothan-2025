import { generateDummyPassword } from "./db/utils";

// Default to development environment if not set
export const isProductionEnvironment = (process.env.NODE_ENV || "development") === "production";
export const isDevelopmentEnvironment = (process.env.NODE_ENV || "development") === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();
