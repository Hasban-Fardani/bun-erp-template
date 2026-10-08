import { copyObjects, createObjectStorage } from "@bun-erp/storage/server";
import { parseCommandOptions } from "@cli/lib/options.ts";
import { defineCommand } from "@cli/registry.ts";
import { storageConfigFromEnv } from "../../infra/storage.ts";

/** `current` names the live STORAGE_* keys; any other value is a variable prefix such as `SOURCE_`. */
function prefixOf(value: string): string {
  return value === "current" ? "" : value;
}

function openStore(label: string, prefix: string) {
  const config = storageConfigFromEnv(process.env, prefix);
  if (config.driver === "r2") {
    throw new Error(
      `${label}: the r2 driver needs a Worker binding. From the CLI reach R2 through its S3 endpoint with the s3 driver (S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com).`,
    );
  }
  return createObjectStorage({ config });
}

export const commands = [
  defineCommand("storage:copy", async (args) => {
    const options = parseCommandOptions(args, { flags: ["dry-run"], values: ["from", "to", "key-prefix"] });
    const from = options.values.get("from");
    const to = options.values.get("to");
    if (from === undefined || to === undefined) {
      process.stderr.write(
        "Usage: bun erp storage:copy --from <env-prefix|current> --to <env-prefix|current> [--key-prefix <path/>] [--dry-run]\n" +
          "  Example: SOURCE_STORAGE_DRIVER=local SOURCE_STORAGE_LOCAL_ROOT=.data/storage \\\n" +
          "           STORAGE_DRIVER=s3 S3_BUCKET=... bun erp storage:copy --from SOURCE_ --to current\n",
      );
      process.exit(2);
    }
    const source = openStore("--from", prefixOf(from));
    const destination = openStore("--to", prefixOf(to));
    const dryRun = options.flags.has("dry-run");
    const summary = await copyObjects({ source, destination, prefix: options.values.get("key-prefix"), dryRun });

    process.stdout.write(
      `${dryRun ? "Would copy" : "Copied"} ${summary.copied} object(s), ${summary.bytes} bytes; ` +
        `skipped ${summary.skipped} already present; failed ${summary.failed.length} (${source.name} -> ${destination.name}).\n`,
    );
    for (const failure of summary.failed) process.stderr.write(`  FAILED ${failure.key}: ${failure.message}\n`);
    if (summary.failed.length > 0) {
      process.stderr.write("Re-run the same command to retry only the failed or missing objects.\n");
      process.exit(1);
    }
  }),
];
