import { expect, test } from "bun:test";

test("mobile builds reject same-origin, insecure and API-prefix configuration before packaging", async () => {
  const root = new URL("../../../", import.meta.url).pathname;
  for (const origin of ["", "http://localhost:3000", "https://api.example.test/api/v1"]) {
    const child = Bun.spawn(["bun", "scripts/mobile.ts", "build"], {
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
