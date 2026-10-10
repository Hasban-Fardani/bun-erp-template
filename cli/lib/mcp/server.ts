/**
 * Minimal MCP server over newline-delimited JSON-RPC 2.0 on stdio. No dependency and no app
 * server: it answers a documented subset and stays read-only.
 *
 * Supported methods:
 * - `initialize`            → protocol version (2024-11-05, 2025-03-26 or 2025-06-18), `tools`
 *                             capability and server info.
 * - `notifications/initialized` (and every notification) → no response, per JSON-RPC.
 * - `ping`                  → empty result.
 * - `tools/list`            → tool names, descriptions and JSON-Schema inputs.
 * - `tools/call`            → one text content block; a tool failure sets `isError`.
 *
 * Anything else answers -32601 (method not found); malformed JSON answers -32700 (parse error).
 */
import {
  asRecord,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  negotiateProtocolVersion,
} from "./protocol.ts";
import { callMcpTool, MCP_TOOLS } from "./tools.ts";

function writeLine(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function errorResponse(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function handleMessage(root: string, raw: string): Promise<void> {
  let message: JsonRpcRequest;
  try {
    message = JSON.parse(raw) as JsonRpcRequest;
  } catch {
    writeLine(errorResponse(null, -32700, "Parse error"));
    return;
  }

  // A notification has no id and must never receive a response.
  if (message.id === undefined) return;
  const id: JsonRpcId = typeof message.id === "string" || typeof message.id === "number" ? message.id : null;
  const method = typeof message.method === "string" ? message.method : "";

  if (method === "initialize") {
    const params = asRecord(message.params);
    writeLine({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "loom-mcp", version: "0.1.0" },
        instructions:
          "Read-only project introspection for the loom template. Tools never write, start an app server or use the network.",
      },
    });
    return;
  }
  if (method === "ping") {
    writeLine({ jsonrpc: "2.0", id, result: {} });
    return;
  }
  if (method === "tools/list") {
    writeLine({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } });
    return;
  }
  if (method === "tools/call") {
    const params = asRecord(message.params);
    const name = typeof params?.name === "string" ? params.name : "";
    if (name.length === 0) {
      writeLine(errorResponse(id, -32602, "tools/call requires a tool name"));
      return;
    }
    const { text, isError } = await callMcpTool(root, name, asRecord(params?.arguments));
    writeLine({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError } });
    return;
  }
  writeLine(errorResponse(id, -32601, `Method not found: ${method}`));
}

/** Reads requests line by line until stdin closes, answering each one in order. */
export async function runMcpServer(root: string): Promise<void> {
  for await (const line of console) {
    const raw = line.trim();
    if (raw.length === 0) continue;
    await handleMessage(root, raw);
  }
}
