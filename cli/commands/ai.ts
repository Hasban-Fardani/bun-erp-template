import { collectAbout, formatAbout } from "../lib/about.ts";
import { refreshGuidelines } from "../lib/guidelines.ts";
import { runMcpServer } from "../lib/mcp/server.ts";
import { repoRoot } from "../lib/repo.ts";
import { defineCommand } from "../registry.ts";

export const commands = [
  defineCommand("about", async () => {
    process.stdout.write(formatAbout(await collectAbout(repoRoot)));
  }),

  defineCommand("mcp", async () => {
    // stdio is the transport; the caller (an MCP client) owns the pipes.
    await runMcpServer(repoRoot);
  }),

  defineCommand("ai:update", async () => {
    const guidelines = await refreshGuidelines(repoRoot);
    process.stdout.write(
      guidelines === "updated"
        ? "Guidelines block updated in AGENTS.md.\n"
        : guidelines === "unchanged"
          ? "Guidelines block already current.\n"
          : "Guidelines block markers are missing from AGENTS.md; add <!-- guidelines:start --> and <!-- guidelines:end -->.\n",
    );
    // The init helpers own the CodeGraph MCP wiring and the project skills; reuse them here.
    const { updateAgentTooling } = await import("../tasks/init-agents.ts");
    await updateAgentTooling();
  }),
];
