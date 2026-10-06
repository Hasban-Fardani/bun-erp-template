import { directoryExists } from "../gates/exists.ts";
import { CHECK_GATE_COMMANDS, GATE_CATALOG, runGate } from "../lib/gates.ts";
import { GateFailure, guard, MIGRATIONS_DIR, repoRoot } from "../lib/repo.ts";
import { defineCommand, runCommand } from "../registry.ts";

/** Aligned name/command/file/summary table for `check:gate --list`, sorted by gate name. */
function gateTable(): string {
  const rows = [...GATE_CATALOG].sort((a, b) => a.name.localeCompare(b.name));
  const cells = [
    ["NAME", "COMMAND", "SOURCE FILE", "SUMMARY"],
    ...rows.map((gate) => [gate.name, gate.command, gate.file, gate.summary]),
  ];
  const widths = [0, 1, 2, 3].map((column) => Math.max(...cells.map((row) => row[column]?.length ?? 0)));
  return `${cells
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")}\n`;
}

export const commands = [
  defineCommand("check:gate", async (args) => {
    const [name, ...forwardedArgs] = args;
    if (name === "--list" || name === "list") {
      process.stdout.write(gateTable());
      return;
    }
    if (!name) {
      process.stderr.write(
        "Usage: bun erp check:gate <name>\nRun `bun erp check:gate --list` to list available gates.\n",
      );
      process.exit(1);
    }
    const legacyCommand = CHECK_GATE_COMMANDS[name];
    if (!legacyCommand) {
      process.stderr.write(
        `Unknown check gate: ${name}. Available: ${Object.keys(CHECK_GATE_COMMANDS).sort().join(", ")}\n`,
      );
      process.exit(1);
    }
    if (!(await runCommand(legacyCommand, forwardedArgs))) {
      throw new Error(`Check gate command is not registered: ${legacyCommand}`);
    }
  }),
  defineCommand("check:mobile", async () => {
    await guard("mobile", () => runGate("mobile"));
    process.stdout.write("Mobile contract OK.\n");
  }),
  defineCommand("check:agents", async () => {
    await guard("agent prerequisites", () => runGate("agents"));
    process.stdout.write("Agent skills and CodeGraph index OK.\n");
  }),
  defineCommand("check:versioning", async () => {
    await guard("versioning", () => runGate("versioning"));
    process.stdout.write("Workspace versions OK.\n");
  }),
  defineCommand("check:language", async () => {
    await guard("language", () => runGate("language"));
    process.stdout.write("Technical language OK.\n");
  }),
  defineCommand("check:architecture", async () => {
    await guard("architecture", () => runGate("architecture"));
  }),
  defineCommand("check:docs", async () => {
    await guard("docs", () => runGate("docs"));
  }),
  defineCommand("check:rpc", async () => {
    await guard("rpc", () => runGate("rpc"));
  }),
  defineCommand("check:ci", async () => {
    await guard("ci", () => runGate("ci"));
  }),

  defineCommand("check", async () => {
    // biome and tsc run first: a type error explains most of the gate noise below, so seeing
    // them first saves reading twelve reports to find the cause.
    const { runProjectChecks } = await import("../gates/parallel-gates.ts");
    process.stdout.write("Running project checks (up to 6 in parallel)…\n");
    const results = await runProjectChecks(repoRoot, {
      onResult: (r) => process.stdout.write(`  ${r.ok ? "ok  " : "FAIL"} ${r.name} (${r.ms}ms)\n`),
    });

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      for (const r of failed) process.stdout.write(`\n${r.name} failed:\n${r.output}\n`);
      throw new GateFailure(failed.map((r) => r.name));
    }
    process.stdout.write("check: OK\n");
  }),

  defineCommand("check:fast", async () => {
    // The inner loop: file-level gates only. The full `check` (tsc + React audit) stays for CI.
    const { runFastChecks } = await import("../gates/parallel-gates.ts");
    process.stdout.write("Running fast checks (no typecheck or React audit)…\n");
    const results = await runFastChecks(repoRoot, {
      onResult: (r) => process.stdout.write(`  ${r.ok ? "ok  " : "FAIL"} ${r.name} (${r.ms}ms)\n`),
    });

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      for (const r of failed) process.stdout.write(`\n${r.name} failed:\n${r.output}\n`);
      throw new GateFailure(failed.map((r) => r.name));
    }
    process.stdout.write("check:fast: OK\n");
  }),

  // Readiness gate: the checks that only matter when this stops being a laptop project.
  defineCommand("check:prod", async () => {
    await guard("readiness", async () => {
      const { checkReadiness } = await import("../gates/readiness.ts");
      const findings = (await checkReadiness(repoRoot)).map((f) => `${f.rule}: ${f.detail}`);
      if (findings.length > 0) throw new GateFailure(findings);
    });
    process.stdout.write("check:prod: OK\n");
  }),

  defineCommand("check:migrations", async () => {
    // `apps/` ships empty; a missing server app is a clean skip, not a missing-directory crash.
    if (!(await directoryExists(MIGRATIONS_DIR))) {
      process.stdout.write("apps/server is not installed; no migrations to check.\n");
      return;
    }
    const files = [...new Bun.Glob("*").scanSync({ cwd: MIGRATIONS_DIR })].sort();
    const bad = files.filter((file) => !/^\d{4}_[a-z0-9_]+\.ts$/.test(file));
    if (bad.length > 0) {
      process.stderr.write(`Migration modules must be NNNN_snake_case.ts: ${bad.join(", ")}\n`);
      process.exit(1);
    }
    process.stdout.write(`${files.length} TypeScript migration module(s) named correctly.\n`);
  }),

  defineCommand("check:scope", async () => {
    await guard("scope", () => runGate("scope"));
    process.stdout.write("Scope OK: no client name or business rule in template files.\n");
  }),

  defineCommand("check:react", async () => {
    await guard("react", () => runGate("react"));
    process.stdout.write("React Doctor OK.\n");
  }),

  defineCommand("check:task", async () => {
    await guard("task", () => runGate("task"));
    process.stdout.write("Tasks valid.\n");
  }),

  defineCommand("check:tdd", async () => {
    await guard("tdd", () => runGate("tdd"));
    process.stdout.write("TDD OK: every server feature has a test.\n");
  }),

  // Gate yang sama dengan `check`, tapi bisa dijalankan sendiri saat mengerjakan satu bidang.
  // Docs dan skills menunjuk perintah ini, jadi ia harus benar-benar ada.
  defineCommand("check:slop", async () => {
    await guard("slop", () => runGate("slop"));
    process.stdout.write("Slop OK.\n");
  }),
  defineCommand("check:platform", async () => {
    await guard("platform", () => runGate("platform"));
    process.stdout.write("Platform OK: Bun only, no stray Node built-ins.\n");
  }),
  defineCommand("check:copy", async () => {
    await guard("copy", () => runGate("copy"));
    process.stdout.write("Copy OK: no technical vocabulary on screen.\n");
  }),
  defineCommand("check:package-targets", async () => {
    await guard("package targets", () => runGate("package-targets"));
    process.stdout.write("Package targets OK: multi-target packages use src/<target>.\n");
  }),
  defineCommand("check:design", async () => {
    await guard("design", () => runGate("design"));
    process.stdout.write("Design OK: screens and text contrast meet the visual rules.\n");
  }),
  defineCommand("check:surface", async () => {
    await guard("surface", () => runGate("surface"));
    process.stdout.write("Surface OK: transient feedback and contextual errors follow the reviewed contract.\n");
  }),
  defineCommand("check:shadcn", async () => {
    await guard("shadcn", () => runGate("shadcn"));
    process.stdout.write("shadcn OK: components come from the design system.\n");
  }),

  defineCommand("check:ui", async () => {
    await guard("ui", () => runGate("ui"));
    process.stdout.write("UI completeness OK: states, focus, theme.\n");
  }),

  defineCommand("check:motion", async () => {
    await guard("motion", () => runGate("motion"));
    process.stdout.write("Motion OK: reduced-motion escape and shared keyframes.\n");
  }),

  defineCommand("skills:validate", async () => {
    await guard("skills", () => runGate("skills"));
    process.stdout.write("Skills OK.\n");
  }),
];
