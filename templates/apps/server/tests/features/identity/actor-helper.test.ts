import { expect, test } from "bun:test";
import { actorOf } from "@/http/helpers/actor.ts";

const SERVER_ROOT = import.meta.dir.replace(/\/tests\/.*$/, "");

test("actorOf keeps only the audit fields of an actor", () => {
  const actor = {
    userId: "u1",
    traceId: "t1",
    label: "a@example.test",
    name: "A",
    email: "a@example.test",
    permissions: ["user.read"],
  } as const;
  expect(actorOf(actor)).toEqual({ userId: "u1", traceId: "t1", label: "a@example.test", impersonator: null });
  const viewed = { ...actor, impersonator: { userId: "admin", label: "admin@example.test", extra: 1 } };
  expect(actorOf(viewed).impersonator).toEqual({ userId: "admin", label: "admin@example.test" });
});

test("actorOf is defined exactly once in server code", async () => {
  const definitions: string[] = [];
  for await (const path of new Bun.Glob("**/*.ts").scan({ cwd: SERVER_ROOT, absolute: true })) {
    if (path.includes("/node_modules/") || path.includes("/tests/")) continue;
    if (/(?:const|function)\s+actorOf\b/.test(await Bun.file(path).text())) definitions.push(path);
  }
  expect(definitions).toHaveLength(1);
});
