import { GATE_CATALOG } from "./gates.ts";

export type HelpCommand = readonly [name: string, description: string];
export type HelpSection = { title: string; commands: readonly HelpCommand[] };

/**
 * Curated groups: titles, ordering and usage strings a catalog entry cannot infer. The gate
 * commands are *not* listed here — `helpSections` derives them from `GATE_CATALOG`, and any
 * registered command that neither group nor catalog mentions lands in "Other", so the printed
 * help cannot silently drift behind the registry again.
 */
export const HELP_GROUPS: readonly HelpSection[] = [
  {
    title: "Project",
    commands: [
      ["init", "Choose the app combination, install agent tooling, and run the first bun install"],
      [
        'project:adopt --name <name> --purpose "<one line>"',
        "Turn a template fork into a project: remove template-only material and write the identity",
      ],
      ["doctor", "Check local environment and database readiness"],
      ["dev", "Start the web app with API and Vite HMR"],
      ["build", "Build the target selected by APP_DEPLOY_TARGET"],
      ["preview", "Preview the built web app"],
      ["server:api", "Run the API without serving web assets"],
    ],
  },
  {
    title: "Quality",
    commands: [
      ["check", "Run all code, type, and project gates in parallel"],
      ["check:fast", "Run the fast gates only (no Biome, typecheck or React audit); use for the inner loop"],
      ["check:prod", "Check production deployment readiness"],
      ["check:gate <name>", "Run one focused gate; use --list to see names"],
      [
        "qa [--only=<suite,...>] [--list] [--dry-run]",
        "Run the web app's Playwright QA suites against a running deployment (needs the web app)",
      ],
      [
        "test",
        "Run backend, web, and package test suites (mobile when installed); --filter <feature> runs one feature",
      ],
    ],
  },
  {
    title: "AI",
    commands: [
      ["about", "Show runtime versions, installed catalog, migrations, routes, database and CodeGraph state"],
      ["mcp", "Run the read-only stdio MCP server that exposes project introspection tools"],
      ["ai:update", "Refresh the AGENTS.md guidelines block, CodeGraph MCP wiring and project skills"],
    ],
  },
  {
    title: "Generators",
    commands: [
      ["make:feature <name>", "Create a server + web CRUD feature, its test, and its create-table migration"],
      ["make:migration <name>", "Create a numbered migration; create_x_table fills the table name"],
      ["make:seeder <name>", "Create an idempotent feature seeder scaffold"],
      ["make:factory <feature> [--table <name>]", "Create a deterministic table factory for tests and seeders"],
      ["make:job <name>", "Create a queue job handler, register it, and write its idempotency test"],
      ["make:event <feature> <name>", "Create a typed domain event inside a feature"],
      [
        "make:listener <feature> <name> --event <event>",
        "Create an event listener, register it and write its dispatch test",
      ],
      ["make:command <group:name>", "Create a server CLI command that the registry discovers"],
      ["make:test <feature> [name]", "Create a feature test skeleton (typed testClient when the feature has routes)"],
      ["make:notification <name> [--type <domain.event>]", "Create a database-channel notification definition"],
      ["make:mail <name>", "Create a mail renderer and queue helper (requires the mail feature)"],
      ["task:new <id> <title>", "Create a plan/task markdown with TDD checkpoints and an evidence section"],
    ],
  },
  {
    title: "Packages",
    commands: [
      ["packages:list", "List installed packages and the opt-in catalog"],
      [
        "packages:install <name>... [--from <path|git-url>]",
        "Install an opt-in package into packages/ and register the workspace",
      ],
    ],
  },
  {
    title: "Features",
    commands: [
      ["features:list", "List installed features and the opt-in catalog"],
      ["features:install <name>...", "Install catalog features into apps/ and wire them automatically"],
    ],
  },
  {
    title: "Apps",
    commands: [
      ["apps", "List workspace apps with build, port, and test status"],
      ["apps:list", "List workspace apps (same as bun erp apps)"],
      ["apps:status <name>", "Show build, port, script, and environment info for one app"],
      [
        "apps:create <name> <server|web|mobile>",
        "Create a workspace app; server scaffolds inline, web/mobile copy their catalog",
      ],
    ],
  },
  {
    title: "Database",
    commands: [
      ["db:migrate", "Apply pending TypeScript migrations"],
      ["db:status", "Show applied and pending migrations"],
      ["db:seed [seeder]", "Seed infrastructure and feature data"],
    ],
  },
  {
    title: "Application",
    commands: [
      ["route:list", "List routes from the assembled Hono app"],
      ["down [--message <text>]", "Put the API in maintenance mode (503 except health and bypass sessions)"],
      ["up", "Leave maintenance mode"],
      ["env:list", "Show safe configuration values and warnings"],
      ["key:generate", "Generate the local authentication secret"],
      ["tinker [--eval <expr>] [--force]", "Open a REPL with db, schema and env preloaded; --eval runs one expression"],
      ["role:list", "List available role keys"],
      ["role:show <key>", "Show one role with its permissions"],
      ["role:create <key> [--name] [--description] [--permissions a,b]", "Create a custom role"],
      [
        "role:edit <key> [--name] [--description] [--permissions a,b]",
        "Update a role; --permissions replaces the whole set",
      ],
      ["role:delete <key> --force", "Delete a custom role"],
      ["user:list", "List users and their roles"],
      ["user:show <email>", "Show one user with roles and permissions"],
      ["user:create <email> <password> [--role <key>] [--name <name>]", "Create a user in the configured database"],
      ["user:edit <email> [--name] [--verified] [--roles a,b]", "Update a profile or replace a user's roles"],
      ["user:delete <email> --force", "Delete a user"],
      ["user:grant <email> [roleKey]", "Grant a role to a user"],
      ["user:revoke <email> <roleKey>", "Revoke a role from a user"],
      ["user:passwd <email> [password]", "Reset a user's password"],
    ],
  },
  {
    title: "Background jobs",
    commands: [
      ["jobs:work", "Run the long-lived job worker"],
      ["jobs:run-once", "Process one bounded batch"],
      ["jobs:status", "Show queue counts"],
      ["jobs:dead", "List jobs that reached terminal failure"],
      ["jobs:retry", "Requeue a dead job by ID"],
      ["jobs:tick", "Enqueue every due schedule; safe to run from cron"],
      ["jobs:schedule [--json]", "Sync registered schedules and show their next runs"],
    ],
  },
  {
    title: "Mail",
    commands: [["mail:test --to <address>", "Verify the mail driver and send one test message"]],
  },
  {
    title: "Cloudflare",
    commands: [
      ["cloudflare:dev", "Run the Worker locally"],
      ["cloudflare:build", "Build the single Worker and static assets"],
      ["cloudflare:deploy", "Build and deploy to Cloudflare Workers"],
    ],
  },
  {
    title: "Mobile",
    commands: [
      ["mobile:dev", "Run the mobile web app with HMR (create it with apps:create <name> mobile)"],
      ["mobile:preview", "Preview the mobile web build"],
      ["mobile:build", "Build mobile web assets"],
      ["mobile:package", "Build a native mobile package; --mode debug|production (default production)"],
      ["mobile:version", "Stamp native version and build number"],
      ["mobile:add", "Add a native Capacitor platform"],
      ["mobile:sync", "Sync web assets to native projects"],
      ["mobile:open", "Open a native project in its IDE"],
    ],
  },
  {
    title: "CI support",
    commands: [
      ["ci:prepare", "Prepare the CI database and owner"],
      ["ci:owner", "Create the CI owner account"],
      ["wait:http", "Wait for an HTTP endpoint to become available"],
    ],
  },
];

/**
 * The sections actually printed. A command is listed once, in the first place that mentions it;
 * gate commands come from `GATE_CATALOG` so a new gate shows up without touching this file; any
 * other registered command is listed under "Other" instead of silently disappearing.
 */
export function helpSections(available: ReadonlySet<string>): HelpSection[] {
  const shown = new Set<string>();
  const sections: HelpSection[] = [];
  const take = (title: string, commands: readonly HelpCommand[]) => {
    const visible = commands.filter(([name]) => {
      const base = name.split(" ")[0] ?? "";
      if (!available.has(base) || shown.has(base)) return false;
      shown.add(base);
      return true;
    });
    if (visible.length > 0) sections.push({ title, commands: visible });
  };

  for (const group of HELP_GROUPS) take(group.title, group.commands);
  take(
    "Gates",
    GATE_CATALOG.map(({ command, summary }) => [command, summary] as const),
  );
  take(
    "Other",
    [...available].sort().map((name) => [name, "(registered command; add a summary in cli/lib/help.ts)"] as const),
  );
  return sections;
}
