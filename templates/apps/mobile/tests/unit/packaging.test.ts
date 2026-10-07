import { expect, test } from "bun:test";
import { repoRoot } from "@cli/lib/repo.ts";

test("mobile builds reject same-origin, insecure and API-prefix configuration before packaging", async () => {
  const root = repoRoot;
  for (const origin of ["", "http://localhost:3000", "https://api.example.test/api/v1"]) {
    const child = Bun.spawn(["bun", "cli/tasks/mobile.ts", "build"], {
      cwd: root,
      env: { ...process.env, VITE_API_BASE_URL: origin },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(1);
    expect(error).toContain("Mobile requires");
    expect(out).not.toContain("vite build");
  }
});

test("mobile:package rejects an unknown or missing --mode before building natively", async () => {
  const root = repoRoot;
  for (const args of [
    ["package", "android", "--mode", "staging"],
    ["package", "android", "--mode"],
  ]) {
    const child = Bun.spawn(["bun", "cli/tasks/mobile.ts", ...args], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(1);
    expect(`${out}${error}`).toContain("--mode");
  }
});
