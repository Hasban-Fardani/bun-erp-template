import { routeTree } from "../routeTree.gen.ts";

// Paths are composed from the generated hierarchy, including nested and pathless layouts.
function collectPaths(node: unknown, parent = "", out: string[] = []): string[] {
  const branch = node as { options?: { path?: string }; children?: unknown[] };
  const segment = branch?.options?.path;
  const fullPath = segment ? `${parent}/${segment}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/" : parent;
  if (segment) out.push(fullPath);
  for (const child of branch?.children ?? []) collectPaths(child, fullPath === "/" ? "" : fullPath, out);
  return out;
}

export const registeredPaths: readonly string[] = [...new Set(collectPaths(routeTree))].sort();
