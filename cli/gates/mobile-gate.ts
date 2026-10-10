import { join } from "node:path";
import { fileIndex } from "../lib/file-index.ts";

export type MobileFinding = { rule: string; detail: string };

/** Mobile source, native shell, logging and pinned Capacitor versions stay an explicit contract. */
export async function checkMobile(root: string): Promise<MobileFinding[]> {
  const findings: MobileFinding[] = [];
  const packagePath = join(root, "apps/mobile/package.json");
  // Mobile is a catalog app: the default template ships server + web only. The contract applies
  // once `bun loom apps:create <name> mobile` restores the app at apps/mobile.
  if (!(await Bun.file(packagePath).exists())) return findings;
  const manifest = (await Bun.file(packagePath).json()) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const capacitor = ["@capacitor/core", "@capacitor/android", "@capacitor/ios", "@capacitor/cli"];
  const versions = capacitor.map((name) => manifest.dependencies?.[name] ?? manifest.devDependencies?.[name] ?? "");
  if (versions.some((version) => !version) || new Set(versions).size !== 1) {
    findings.push({
      rule: "CAPACITOR_VERSION_MISMATCH",
      detail: "Capacitor core, platforms and CLI must use one exact version.",
    });
  }

  for (const file of [
    "apps/mobile/src/main.tsx",
    "apps/mobile/src/lib/rpc.ts",
    "apps/mobile/src/lib/logger.ts",
    "apps/mobile/src/features/offline/stores/offline-store.ts",
    "apps/mobile/src/features/offline/components/offline-banner.tsx",
    "apps/mobile/src/features/offline/components/offline-drafts.tsx",
    "apps/mobile/vite.config.ts",
    "apps/mobile/tests/unit/logger.test.ts",
    "apps/mobile/tests/unit/packaging.test.ts",
    "apps/mobile/tests/unit/versioning.test.ts",
    "cli/tasks/mobile-version.ts",
  ]) {
    if (!(await Bun.file(join(root, file)).exists())) {
      findings.push({ rule: "MOBILE_ENTRY_MISSING", detail: `${file} is required by the mobile app contract.` });
    }
  }

  const releasePath = ".github/workflows/mobile-release.yml";
  const releaseWorkflow = await Bun.file(join(root, releasePath)).text();
  for (const required of [
    "mobile:package android",
    "--androidreleasetype AAB",
    "Google Play internal testing",
    "mobile:package ios",
    "Upload to TestFlight",
    "mobile:version",
    "ANDROID_KEYSTORE_BASE64",
    "IOS_KEYCHAIN_PASSWORD",
    "APP_STORE_CONNECT_PRIVATE_KEY_BASE64",
  ]) {
    if (!releaseWorkflow.includes(required)) {
      findings.push({ rule: "MOBILE_RELEASE_INCOMPLETE", detail: `${releasePath} must include ${required}.` });
    }
  }

  const config = await Bun.file(join(root, "apps/mobile/capacitor.config.ts")).text();
  if (/server\s*:\s*\{[^}]*\burl\s*:/s.test(config)) {
    findings.push({
      rule: "REMOTE_WEBVIEW",
      detail: "Packaged mobile builds must load the bundled app, not server.url.",
    });
  }
  if (!/@capacitor-community\/sqlite/.test(JSON.stringify(manifest.dependencies ?? {}))) {
    findings.push({
      rule: "OFFLINE_DATABASE_MISSING",
      detail: "Mobile offline records require the pinned Capacitor SQLite driver.",
    });
  }
  if (!/iosIsEncryption:\s*true/.test(config) || !/androidIsEncryption:\s*true/.test(config)) {
    findings.push({
      rule: "OFFLINE_DATABASE_UNENCRYPTED",
      detail: "Native offline SQLite must enable encryption on iOS and Android.",
    });
  }

  const sources = await fileIndex(root).files("apps/mobile/src/**/*.{ts,tsx}");
  for (const file of sources) {
    if (file === "apps/mobile/src/lib/logger.ts") continue;
    const source = await fileIndex(root).text(file);
    if (/\bconsole\.(debug|info|log|warn|error)\s*\(/.test(source)) {
      findings.push({ rule: "DIRECT_CONSOLE", detail: `${file} must send diagnostics through lib/logger.ts.` });
    }
  }
  return findings;
}
