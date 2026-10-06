import { loadEnv } from "../../config/index.ts";
import { envKeys } from "../../config/schema.ts";

export type DevelopmentEnvironment = {
  apiPort: number;
  webPort: number;
  webUrl: string;
  server: Record<string, string>;
  web: Record<string, string>;
};

/** Builds local HMR settings from the same validated `.env` config used by the CLI. */
export function createDevelopmentEnvironment(
  source: Record<string, string | undefined> = process.env,
): DevelopmentEnvironment {
  const apiPort = portFromEnvironment(source, "DEV_API_PORT", 3000);
  const webPort = portFromEnvironment(source, "DEV_WEB_PORT", 5173);
  const webUrl = `http://localhost:${webPort}`;
  const systemEnvironment = pickSystemEnvironment(source);
  const configured = loadEnv(source);
  if (configured.APP_ENV === "production") {
    throw new Error(
      "Refusing to start `bun dev` with APP_ENV=production. Set APP_ENV=development in .env and point its database settings at an isolated development database.",
    );
  }
  if (configured.APP_ENV === "test") {
    throw new Error("Refusing to start `bun dev` with APP_ENV=test. Use APP_ENV=development for the local app.");
  }

  const serverEnvironment: Record<string, string> = {
    ...systemEnvironment,
    ...Object.fromEntries(envKeys.map((key) => [key, String(configured[key as keyof typeof configured] ?? "")])),
    APP_ENV: "development",
    APP_PORT: String(apiPort),
    APP_RELEASE: "local",
    APP_URL: webUrl,
    AUTH_TRUSTED_ORIGINS: mergeTrustedOrigins(configured.AUTH_TRUSTED_ORIGINS, webPort),
    BETTER_AUTH_SECRET: configured.BETTER_AUTH_SECRET || createLocalAuthSecret(),
    BETTER_AUTH_URL: webUrl,
  };

  return {
    apiPort,
    webPort,
    webUrl,
    server: serverEnvironment,
    web: {
      ...systemEnvironment,
      ...Object.fromEntries(
        Object.entries(source).flatMap(([key, value]) =>
          key.startsWith("VITE_") && typeof value === "string" ? [[key, value]] : [],
        ),
      ),
      NODE_ENV: "development",
      API_PORT: String(apiPort),
      VITE_API_BASE_URL: "",
    },
  };
}

function mergeTrustedOrigins(configured: string | undefined, webPort: number): string {
  const localOrigins = [`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`];
  return [
    ...new Set([
      ...(configured ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...localOrigins,
    ]),
  ].join(",");
}

function portFromEnvironment(source: Record<string, string | undefined>, name: string, fallback: number): number {
  const candidate = source[name];
  if (candidate === undefined) return fallback;
  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535`);
  }
  return port;
}

function pickSystemEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const safeKeys = ["PATH", "HOME", "TMPDIR", "LANG", "TERM"] as const;
  return Object.fromEntries(safeKeys.flatMap((key) => (source[key] ? [[key, source[key] as string]] : [])));
}

function createLocalAuthSecret(): string {
  return [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()].join("");
}
