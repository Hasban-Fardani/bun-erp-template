import { expect, test } from "bun:test";
import { stampAndroidVersion, stampIosVersion } from "../../../../cli/tasks/mobile-version.ts";

test("native projects receive the shared SemVer and monotonic build number", () => {
  const android = stampAndroidVersion(
    'android { defaultConfig { versionCode 1; versionName "1.0" } }',
    "0.1.0",
    "4207",
  );
  const ios = stampIosVersion(
    "MARKETING_VERSION = 1.0; CURRENT_PROJECT_VERSION = 1;\nMARKETING_VERSION = 1.0; CURRENT_PROJECT_VERSION = 1;",
    "0.1.0",
    "4207",
  );

  expect(android).toContain('versionCode 4207; versionName "0.1.0"');
  expect(ios.match(/MARKETING_VERSION = 0\.1\.0;/g)).toHaveLength(2);
  expect(ios.match(/CURRENT_PROJECT_VERSION = 4207;/g)).toHaveLength(2);
});

test("native version stamping fails when the generated project shape changes", () => {
  expect(() => stampAndroidVersion('android { versionName "1.0" }', "0.1.0", "10")).toThrow("versionCode");
});
