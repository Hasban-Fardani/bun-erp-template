import { expect, test } from "bun:test";
import { runChecksParallel } from "../../../../tools/parallel-gates.ts";

test("independent checks all finish and preserve failure output", async () => {
  const completed: string[] = [];
  const results = await runChecksParallel(
    import.meta.dir,
    [
      { name: "missing", argv: ["/nonexistent-template-check-fixture"] },
      { name: "failure", argv: ["bun", "-e", 'console.error("failure detail"); process.exit(2)'] },
      { name: "success", argv: ["bun", "-e", 'await Bun.sleep(20); console.log("other check finished")'] },
    ],
    { concurrency: 2, onResult: (result) => completed.push(result.name) },
  );
  expect(results.map(({ name, ok }) => ({ name, ok }))).toEqual([
    { name: "missing", ok: false },
    { name: "failure", ok: false },
    { name: "success", ok: true },
  ]);
  expect(results[0]?.output).toContain("nonexistent-template-check-fixture");
  expect(results[1]?.output).toContain("failure detail");
  expect(results[2]?.output).toContain("other check finished");
  expect(completed.toSorted()).toEqual(["failure", "missing", "success"]);
});
