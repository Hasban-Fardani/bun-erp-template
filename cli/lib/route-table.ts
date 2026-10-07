import { resolve } from "node:path";
import { fileIndex } from "./file-index.ts";

/**
 * Route introspection without starting the server. The route table source is the assembled app:
 * `apps/server/routes/api.ts` plus each feature's `route.ts` and `feature.ts` mount declaration.
 * Parsing those files keeps `bun erp mcp routes` honest (it reads the same source `route:list`
 * mounts) while staying read-only and dependency-free.
 */

export type RouteEntry = {
  method: string;
  path: string;
  feature: string;
  /** Permission key, `authenticated`, `public`, or null when the route declares neither. */
  permission: string | null;
  source: string;
};

const HTTP_METHODS = ["get", "post", "patch", "put", "delete", "options", "head"] as const;
/**
 * Route calls are chained onto the app (`...createApp().get(...)`) and may be separated by
 * whitespace and comments; `c.get("actor")` is a context read, not a route, so the match starts
 * at the closing paren of the previous call.
 */
const ROUTE_CALL = /\)(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*\.(get|post|patch|put|delete|options|head|on)\s*\(/g;
const API_PREFIX = "/api/v1";

/** Walks a quoted string (single, double or template) starting at `start`; returns its value. */
function readString(text: string, start: number): { value: string; end: number } | undefined {
  const quote = text[start];
  if (quote !== '"' && quote !== "'" && quote !== "`") return undefined;
  let value = "";
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      value += text[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (char === quote) return { value, end: index + 1 };
    if (quote === "`" && char === "$" && text[index + 1] === "{") {
      const close = text.indexOf("}", index + 2);
      const expression = close < 0 ? "" : text.slice(index + 2, close);
      value += expression === "API_PREFIX" ? API_PREFIX : `\${${expression}}`;
      index = close < 0 ? text.length : close;
      continue;
    }
    value += char;
  }
  return { value, end: text.length };
}

/** Finds the matching close bracket, skipping strings, template expressions and comments. */
function findMatching(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd < 0 ? text.length : lineEnd;
      continue;
    }
    if (char === "/" && next === "*") {
      const blockEnd = text.indexOf("*/", index + 2);
      index = blockEnd < 0 ? text.length : blockEnd + 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const read = readString(text, index);
      index = read ? read.end - 1 : index;
      continue;
    }
    if (char === openChar) depth += 1;
    else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

function skipTrivia(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char ?? "")) {
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      const lineEnd = text.indexOf("\n", index);
      index = lineEnd < 0 ? text.length : lineEnd + 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const blockEnd = text.indexOf("*/", index + 2);
      index = blockEnd < 0 ? text.length : blockEnd + 2;
      continue;
    }
    return index;
  }
  return index;
}

type RouteFileContext = {
  feature: string;
  prefix: string;
  permissionMap: ReadonlyMap<string, string>;
  defaultPermission: string | null;
  source: string;
};

function permissionOf(args: string, context: RouteFileContext): string | null {
  const mapped = /ACTION_PERMISSION\.([A-Za-z0-9_]+)/.exec(args);
  if (mapped?.[1]) return context.permissionMap.get(mapped[1]) ?? mapped[1];
  if (/\bpublic:\s*true/.test(args)) return "public";
  if (/\b(requireActor|authorizeActor|requirePermission|authorize)\s*\(/.test(args)) return "authenticated";
  return context.defaultPermission;
}

function parseRouteCalls(source: string, context: RouteFileContext): RouteEntry[] {
  const entries: RouteEntry[] = [];
  for (const match of source.matchAll(ROUTE_CALL)) {
    const methodToken = match[1] ?? "";
    const callOpen = (match.index ?? 0) + match[0].length - 1;
    const callClose = findMatching(source, callOpen, "(", ")");
    const args = source.slice(callOpen + 1, callClose);
    let cursor = skipTrivia(args, 0);

    let methods: string[];
    if (args[cursor] === "[") {
      const arrayClose = findMatching(args, cursor, "[", "]");
      const arrayText = args.slice(cursor + 1, arrayClose);
      methods = [...arrayText.matchAll(/["']([A-Za-z]+)["']/g)]
        .map((entry) => (entry[1] ?? "").toUpperCase())
        .filter((method) => (HTTP_METHODS as readonly string[]).includes(method.toLowerCase()));
      cursor = skipTrivia(args, arrayClose + 1);
      if (args[cursor] === ",") cursor = skipTrivia(args, cursor + 1);
    } else {
      methods = [methodToken.toUpperCase()];
    }

    const pathRead = readString(args, cursor);
    if (!pathRead) continue;
    const routePath = pathRead.value;
    const joined = routePath === "/" ? context.prefix : `${context.prefix}${routePath}`;
    const permission = permissionOf(args.slice(pathRead.end), context);
    for (const method of methods) {
      entries.push({ method, path: joined, feature: context.feature, permission, source: context.source });
    }
  }
  return entries;
}

function parsePermissionMap(policySource: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of policySource.matchAll(/([A-Za-z0-9_]+):\s*["']([^"']+)["']/g)) {
    if (match[1] && match[2]) map.set(match[1], match[2]);
  }
  return map;
}

async function readIfPresent(path: string): Promise<string | undefined> {
  return (await Bun.file(path).exists()) ? Bun.file(path).text() : undefined;
}

/** Every route in the installed server app, sorted by path then method. */
export async function collectRoutes(root: string): Promise<RouteEntry[]> {
  const serverDir = resolve(root, "apps/server");
  const apiPath = resolve(serverDir, "routes/api.ts");
  if (!(await Bun.file(apiPath).exists())) return [];

  const entries: RouteEntry[] = [];
  entries.push(
    ...parseRouteCalls(await Bun.file(apiPath).text(), {
      feature: "core",
      prefix: "",
      permissionMap: new Map(),
      defaultPermission: "authenticated",
      source: "apps/server/routes/api.ts",
    }),
  );
  // The auth wildcard delegates to Better Auth's public sign-in/sign-up handlers.
  for (const entry of entries) {
    if (entry.path.endsWith("/auth/*")) entry.permission = "public";
  }

  const featureNames = (await fileIndex(root).files("apps/server/features/*/route.ts"))
    .map((file) => file.split("/")[3])
    .filter((name): name is string => Boolean(name))
    .sort();

  for (const name of featureNames) {
    const routeSource = await readIfPresent(resolve(serverDir, "features", name, "route.ts"));
    if (!routeSource) continue;
    const featureSource = await readIfPresent(resolve(serverDir, "features", name, "feature.ts"));
    const mount = featureSource ? /path:\s*["']([^"']+)["']/.exec(featureSource)?.[1] : undefined;
    const policySource = await readIfPresent(resolve(serverDir, "features", name, "policy.ts"));
    entries.push(
      ...parseRouteCalls(routeSource, {
        feature: name,
        prefix: `${API_PREFIX}/${mount ?? name}`,
        permissionMap: policySource ? parsePermissionMap(policySource) : new Map(),
        defaultPermission: null,
        source: `apps/server/features/${name}/route.ts`,
      }),
    );
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** One readable line per route; used by the MCP `routes` tool. */
export function formatRoutes(routes: readonly RouteEntry[], feature?: string): string {
  const filtered = feature ? routes.filter((route) => route.feature === feature) : routes;
  if (filtered.length === 0) return feature ? `No routes for feature "${feature}".` : "No routes found.";
  const lines = filtered.map(
    (route) =>
      `${route.method.padEnd(7)} ${route.path.padEnd(38)} ${route.feature.padEnd(14)} ${route.permission ?? "—"}`,
  );
  const features = new Set(filtered.map((route) => route.feature));
  return [
    `${filtered.length} route(s) across ${features.size} feature(s)`,
    "",
    `${"METHOD".padEnd(7)} ${"PATH".padEnd(38)} ${"FEATURE".padEnd(14)} PERMISSION`,
    ...lines,
  ].join("\n");
}
