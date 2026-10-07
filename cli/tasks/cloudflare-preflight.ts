import { validateCloudflarePreflight } from "../gates/cloudflare-preflight.ts";

const config = Bun.JSONC.parse(await Bun.file("wrangler.jsonc").text()) as {
  hyperdrive?: { id?: string }[];
  vars?: Record<string, string>;
  limits?: { cpu_ms?: number };
  assets?: { not_found_handling?: string; run_worker_first?: string[] };
};
const findings = await validateCloudflarePreflight(
  {
    CLOUDFLARE_API_TOKEN: Bun.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: Bun.env.CLOUDFLARE_ACCOUNT_ID,
    DATABASE_URL: Bun.env.DATABASE_URL,
    BETTER_AUTH_SECRET: Bun.env.BETTER_AUTH_SECRET,
    CLOUDFLARE_APP_URL: Bun.env.CLOUDFLARE_APP_URL,
  },
  config,
);
if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  process.exit(1);
}
process.stdout.write("Cloudflare deployment configuration is valid.\n");
