import { resolve } from "node:path";
import { collectAbout } from "../about.ts";
import { collectDbSchema, formatDbSchema } from "../db-schema.ts";
import { formatDocsSearch, searchDocs } from "../docs-search.ts";
import { GUIDELINES_END, GUIDELINES_START } from "../guidelines.ts";
import { collectRoutes, formatRoutes } from "../route-table.ts";

/**
 * The MCP tool catalogue. Every tool is read-only: it reads repo files, the local log file, or
 * spawns the existing `jobs:status` CLI command. None of them writes, starts an app server or uses
 * the network.
 */

export type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: "app-info",
    description: "Runtime versions, installed apps/packages/features, migration, route, gate and CodeGraph counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "db-schema",
    description: "Tables, columns and indexes parsed from the Drizzle schema files and SQL migrations.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string", description: "Optional table name filter (substring)." } },
      additionalProperties: false,
    },
  },
  {
    name: "routes",
    description: "API routes with method, path, feature and required permission, read from the route source files.",
    inputSchema: {
      type: "object",
      properties: { feature: { type: "string", description: "Optional feature name filter." } },
      additionalProperties: false,
    },
  },
  {
    name: "logs",
    description: "Recent structured log lines from the configured log file, with secrets redacted.",
    inputSchema: {
      type: "object",
      properties: {
        lines: { type: "integer", description: "How many trailing lines to return (default 50, max 200)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "jobs",
    description: "Queued, running, failed and dead background job counts via the read-only jobs:status command.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "docs-search",
    description: "Local search over docs/**, package llms.txt guides and feature READMEs. No network.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Space-separated search terms." },
        limit: { type: "integer", description: "Maximum hits (default 10)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "guidelines",
    description: "The aggregated AI guidelines block from AGENTS.md (installed apps, packages and features).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const SECRET_KEY = /(pass(word)?|secret|token|authorization|cookie|api[_-]?key|credential)/i;

function redactString(text: string): string {
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]")
    .replace(/\b(sk|pk|ghp|xox[baprs])[-_][A-Za-z0-9_-]{8,}/g, "[REDACTED]");
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactValue(entry);
    }
    return result;
  }
  if (typeof value === "string") return redactString(value);
  return value;
}

async function logsText(root: string, lines: number): Promise<string> {
  const configured = process.env.LOG_PATH ?? ".data/logs/app.log";
  const path = configured.startsWith("/") ? configured : resolve(root, configured);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return `No log file at ${path}. The log driver is console or the app has not written logs yet.`;
  }
  // Read only the tail: a production log can reach the configured 100 MB limit.
  const window = file.slice(Math.max(0, file.size - 256 * 1024));
  const raw = (await window.text()).split("\n").filter((line) => line.trim().length > 0);
  const selected = raw.slice(-Math.min(Math.max(lines, 1), 200));
  const redacted = selected.map((line) => {
    try {
      return JSON.stringify(redactValue(JSON.parse(line)));
    } catch {
      return redactString(line);
    }
  });
  return [`${redacted.length} line(s) from ${path}`, "", ...redacted].join("\n");
}

async function jobsText(root: string): Promise<string> {
  const proc = Bun.spawn(["bun", "cli/index.ts", "jobs:status"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 15_000);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      const reason = (err.trim() || out.trim() || `exit ${code}`).split("\n")[0];
      return `Background jobs are unavailable: ${reason}`;
    }
    const counts: Record<string, number> = {};
    for (const line of out.split("\n")) {
      const match = /^(\S+)\s+(\d+)\s*$/.exec(line.trim());
      if (match?.[1] && match[2]) counts[match[1]] = Number(match[2]);
    }
    const summary = {
      queued: counts.queued ?? 0,
      running: counts.running ?? 0,
      failed: counts.failed ?? 0,
      dead: counts.dead ?? 0,
      byStatus: counts,
    };
    return `${JSON.stringify(summary, null, 2)}\n\n${out.trim()}`;
  } finally {
    clearTimeout(timer);
  }
}

async function guidelinesText(root: string): Promise<string> {
  const source = await Bun.file(resolve(root, "AGENTS.md")).text();
  const start = source.indexOf(GUIDELINES_START);
  const end = source.indexOf(GUIDELINES_END);
  if (start < 0 || end < start) return "The AGENTS.md guidelines block is missing. Run bun erp ai:update.";
  return source.slice(start, end + GUIDELINES_END.length);
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Executes one tool by name; a tool failure is content, never a thrown protocol error. */
export async function callMcpTool(
  root: string,
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<{ text: string; isError: boolean }> {
  try {
    switch (name) {
      case "app-info":
        return { text: JSON.stringify(await collectAbout(root), null, 2), isError: false };
      case "db-schema": {
        const tables = await collectDbSchema(root);
        const filter = typeof args?.table === "string" ? args.table : undefined;
        return { text: formatDbSchema(tables, filter), isError: false };
      }
      case "routes": {
        const routes = await collectRoutes(root);
        const feature = typeof args?.feature === "string" ? args.feature : undefined;
        return { text: formatRoutes(routes, feature), isError: false };
      }
      case "logs":
        return { text: await logsText(root, positiveInteger(args?.lines, 50)), isError: false };
      case "jobs":
        return { text: await jobsText(root), isError: false };
      case "docs-search": {
        const query = typeof args?.query === "string" ? args.query : "";
        if (query.trim().length === 0) return { text: "docs-search requires a non-empty query.", isError: true };
        const hits = await searchDocs(root, query, positiveInteger(args?.limit, 10));
        return { text: formatDocsSearch(hits, query), isError: false };
      }
      case "guidelines":
        return { text: await guidelinesText(root), isError: false };
      default:
        return { text: `Unknown tool: ${name}`, isError: true };
    }
  } catch (error) {
    return {
      text: `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}
