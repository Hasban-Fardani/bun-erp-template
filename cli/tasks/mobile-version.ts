type MobilePlatform = "android" | "ios" | "all";

export function stampAndroidVersion(source: string, version: string, buildNumber: string): string {
  const versionCode = replaceExactlyOnce(
    source,
    /\bversionCode\s+\d+/g,
    `versionCode ${buildNumber}`,
    "Android versionCode",
  );
  return replaceExactlyOnce(
    versionCode,
    /\bversionName\s+["'][^"']+["']/g,
    `versionName "${version}"`,
    "Android versionName",
  );
}

export function stampIosVersion(source: string, version: string, buildNumber: string): string {
  const withMarketingVersion = replaceAtLeastOnce(
    source,
    /MARKETING_VERSION\s*=\s*[^;]+;/g,
    `MARKETING_VERSION = ${version};`,
    "iOS MARKETING_VERSION",
  );
  return replaceAtLeastOnce(
    withMarketingVersion,
    /CURRENT_PROJECT_VERSION\s*=\s*[^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    "iOS CURRENT_PROJECT_VERSION",
  );
}

if (import.meta.main) await main();

async function main() {
  const platform = process.argv[2] as MobilePlatform | undefined;
  if (platform !== "android" && platform !== "ios" && platform !== "all") {
    throw new Error("Choose android, ios, or all");
  }

  const packagePath = `${import.meta.dir}/../../apps/mobile/package.json`;
  if (!(await Bun.file(packagePath).exists())) {
    process.stderr.write(
      "apps/mobile is not installed. Run `bun loom init` (choose a combination with mobile) or `bun loom apps:create mobile mobile`, then bun install.\n",
    );
    process.exit(1);
  }
  const mobilePackage = (await Bun.file(packagePath).json()) as {
    version: string;
  };
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(mobilePackage.version)) {
    throw new Error("apps/mobile/package.json must contain a SemVer version");
  }

  const buildNumber = process.env.MOBILE_BUILD_NUMBER ?? "";
  const buildNumberValue = Number(buildNumber);
  if (
    !/^\d+$/.test(buildNumber) ||
    !Number.isSafeInteger(buildNumberValue) ||
    buildNumberValue < 1 ||
    buildNumberValue > 2_100_000_000
  ) {
    throw new Error("MOBILE_BUILD_NUMBER must be an integer from 1 to 2100000000");
  }

  if (platform === "android" || platform === "all") {
    const path = `${import.meta.dir}/../../apps/mobile/android/app/build.gradle`;
    const source = await Bun.file(path).text();
    await Bun.write(path, stampAndroidVersion(source, mobilePackage.version, buildNumber));
  }

  if (platform === "ios" || platform === "all") {
    const path = `${import.meta.dir}/../../apps/mobile/ios/App/App.xcodeproj/project.pbxproj`;
    const source = await Bun.file(path).text();
    await Bun.write(path, stampIosVersion(source, mobilePackage.version, buildNumber));
  }

  process.stdout.write(`Native version set to ${mobilePackage.version} (${buildNumber}).\n`);
}

function replaceExactlyOnce(source: string, pattern: RegExp, replacement: string, label: string): string {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected one ${label} field; found ${matches.length}`);
  return source.replace(pattern, replacement);
}

function replaceAtLeastOnce(source: string, pattern: RegExp, replacement: string, label: string): string {
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) throw new Error(`Could not find ${label} field`);
  return source.replace(pattern, replacement);
}
