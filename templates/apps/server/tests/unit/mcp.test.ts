import { expect, test } from "bun:test";
import { repoRoot } from "../../../../cli/lib/repo.ts";

type JsonRpcResponse = {
  id?: string | number | null;
  result?: {
    protocolVersion?: string;
    capabilities?: { tools?: unknown };
    serverInfo?: { name?: string };
    tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

const TOOL_NAMES = ["app-info", "db-schema", "docs-search", "guidelines", "jobs", "logs", "routes"];

const CALL_ARGS: Record<string, Record<string, unknown>> = {
  "app-info": {},
  "db-schema": {},
  routes: {},
  logs: { lines: 5 },
  jobs: {},
  "docs-search": { query: "migration" },
  guidelines: {},
};

async function runHandshake(): Promise<{ responses: JsonRpcResponse[]; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "cli/index.ts", "mcp"], {
    cwd: repoRoot,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const requests: Array<Record<string, unknown>> = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "ping" },
    { jsonrpc: "2.0", id: 3, method: "tools/list" },
  ];
  let nextId = 4;
  for (const name of TOOL_NAMES) {
    requests.push({ jsonrpc: "2.0", id: nextId, method: "tools/call", params: { name, arguments: CALL_ARGS[name] } });
    nextId += 1;
  }
  requests.push({ jsonrpc: "2.0", id: nextId, method: "unknown/method" });
  nextId += 1;

  const lines = requests.map((request) => JSON.stringify(request));
  lines.push("{not json");
  proc.stdin.write(`${lines.join("\n")}\n`);
  await proc.stdin.end();

  const [out, err, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const responses = out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRpcResponse);
  return { responses, stderr: err, exitCode };
}

test("the MCP server completes a real handshake and answers every tool", async () => {
  const { responses, stderr, exitCode } = await runHandshake();
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  // One response per request with an id, plus the parse error; the initialized notification is silent.
  expect(responses).toHaveLength(TOOL_NAMES.length + 5);

  const byId = new Map(responses.filter((response) => response.id != null).map((response) => [response.id, response]));

  const initialized = byId.get(1);
  expect(initialized?.result?.protocolVersion).toBe("2025-06-18");
  expect(initialized?.result?.capabilities?.tools).toBeDefined();
  expect(initialized?.result?.serverInfo?.name).toBeTruthy();

  expect(byId.get(2)?.result).toEqual({});

  const tools = byId.get(3)?.result?.tools ?? [];
  expect(tools.map((tool) => tool.name).sort()).toEqual(TOOL_NAMES);
  for (const tool of tools) {
    expect(tool.description).toBeTruthy();
    expect(tool.inputSchema).toMatchObject({ type: "object" });
  }

  for (const [index] of TOOL_NAMES.entries()) {
    const response = byId.get(4 + index);
    const content = response?.result?.content;
    expect(response?.result?.isError).not.toBe(true);
    expect(content?.[0]?.type).toBe("text");
    expect((content?.[0]?.text ?? "").length).toBeGreaterThan(0);
  }

  const callId = (name: string) => 4 + TOOL_NAMES.indexOf(name);

  const appInfo = JSON.parse(byId.get(callId("app-info"))?.result?.content?.[0]?.text ?? "{}") as {
    gates?: number;
    routes?: number;
  };
  expect(appInfo.gates).toBe(28);
  expect(appInfo.routes).toBeGreaterThanOrEqual(20);

  const schema = byId.get(callId("db-schema"))?.result?.content?.[0]?.text ?? "";
  expect(schema).toContain("background_jobs");
  expect(schema).toContain("queue_name");

  const routes = byId.get(callId("routes"))?.result?.content?.[0]?.text ?? "";
  expect(routes).toContain("/api/v1/users");
  expect(routes).toContain("user.read");

  const docs = byId.get(callId("docs-search"))?.result?.content?.[0]?.text ?? "";
  expect(docs).toContain("docs/");

  const guidelines = byId.get(callId("guidelines"))?.result?.content?.[0]?.text ?? "";
  expect(guidelines).toContain("packages/ui/llms.txt");

  const unknown = byId.get(4 + TOOL_NAMES.length);
  expect(unknown?.error?.code).toBe(-32601);

  const parseError = responses.find((response) => response.id === null || response.id === undefined);
  expect(parseError?.error?.code).toBe(-32700);
});

test("initialize negotiates an older supported protocol version", async () => {
  const proc = Bun.spawn(["bun", "cli/index.ts", "mcp"], {
    cwd: repoRoot,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "old", version: "1" } },
    })}\n`,
  );
  await proc.stdin.end();
  const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  const response = JSON.parse(out.trim()) as JsonRpcResponse;
  expect(response.result?.protocolVersion).toBe("2024-11-05");
});
