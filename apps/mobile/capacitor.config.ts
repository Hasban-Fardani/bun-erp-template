import type { CapacitorConfig } from "@capacitor/cli";

const appId = process.env.MOBILE_APP_ID;
const appName = process.env.MOBILE_APP_NAME;
if (!appId || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(appId)) {
  throw new Error("Set MOBILE_APP_ID to the reverse-domain identifier owned by your application");
}
if (!appName?.trim()) throw new Error("Set MOBILE_APP_NAME before generating a native project");

const config: CapacitorConfig = {
  appId,
  appName,
  webDir: "www",
  loggingBehavior: "debug",
  server: { iosScheme: "capacitor", androidScheme: "https" },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: true,
      iosKeychainPrefix: appId.replaceAll(".", "_"),
      androidIsEncryption: true,
    },
  },
};

export default config;
