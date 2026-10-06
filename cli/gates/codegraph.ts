/**
 * Single source of truth for the CodeGraph toolchain. Every caller (init, readiness gate, agent
 * MCP wiring) resolves the same package and version here so a local install can never drift from
 * the pinned release.
 */

export const CODEGRAPH_PACKAGE = "@colbymchenry/codegraph";
export const CODEGRAPH_VERSION = "1.6.2";

/**
 * Run CodeGraph through `bunx` at the pinned version. This keeps indexing, install, and checks on
 * one release regardless of any older `codegraph` a developer already has on their PATH.
 */
export function codegraphCommand(...args: string[]): string[] {
  return ["bunx", "--bun", `${CODEGRAPH_PACKAGE}@${CODEGRAPH_VERSION}`, ...args];
}

/**
 * The command an agent should launch as its MCP server. Pinning the version inside the command
 * itself means the server keeps reporting the same release even when a bare `codegraph` on PATH
 * is older.
 */
export function codegraphMcpCommand(): string[] {
  return codegraphCommand("serve", "--mcp");
}
