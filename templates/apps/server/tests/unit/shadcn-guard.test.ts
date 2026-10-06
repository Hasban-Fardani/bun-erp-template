import { expect, test } from "bun:test";
import { validateRegistryContract, validateVendoredSourceCatalog } from "../../../../gates/shadcn-guard.ts";

const approved = [
  { name: "@shadcn", url: "https://ui.shadcn.com/r/styles/new-york-v4/{name}.json" },
  { name: "@dashboardcn", url: "https://dashboardcn.com/r/{name}.json" },
  { name: "@dashboardblocks", url: "https://www.dashboardblocks.com/r/{name}.json" },
  { name: "@emailcn", url: "https://emailcn.run/r/{name}.json" },
  { name: "@pdfcn", url: "https://pdfcn.dev/r/{name}.json" },
];

test("registry contract allows only reviewed registries and records component provenance", () => {
  const commit = "a".repeat(40);
  const findings = validateRegistryContract({
    allowed: approved,
    configured: Object.fromEntries(approved.map(({ name, url }) => [name, url])),
    sources: {
      "packages/ui/src/atoms/button.tsx": {
        registry: "@shadcn",
        component: "button",
        reference: "https://ui.shadcn.com/r/styles/new-york-v4/button.json",
        license: "MIT",
        upstream: `https://github.com/shadcn-ui/ui/blob/${commit}/apps/v4/registry/new-york-v4/ui/button.tsx`,
        adaptation: "Uses package-local imports.",
      },
      "packages/ui/src/atoms/metric.tsx": {
        registry: "@dashboardcn",
        component: "metric-value",
        reference: "https://dashboardcn.com/r/metric-value.json",
        license: "MIT",
        upstream: "https://github.com/NoahGdev/dashboardcn",
      },
      "packages/ui/src/molecules/form-errors.tsx": {
        registry: "custom",
        reference: "https://tanstack.com/form/latest/docs/framework/react/guides/validation",
        rationale: "Renders accessible TanStack Form errors.",
      },
    },
    componentFiles: [
      "packages/ui/src/atoms/button.tsx",
      "packages/ui/src/atoms/metric.tsx",
      "packages/ui/src/molecules/form-errors.tsx",
    ],
    shadcnUpstreamCommit: commit,
  });
  expect(findings).toEqual([]);
});

test("registry contract rejects registry drift, unapproved sources and stale metadata", () => {
  const findings = validateRegistryContract({
    allowed: [...approved, { name: "@random", url: "https://example.test/{name}.json" }],
    configured: { "@random": "https://example.test/{name}.json" },
    sources: {
      "packages/ui/src/atoms/button.tsx": { registry: "@random", component: "button" },
      "packages/ui/src/atoms/old.tsx": { registry: "@shadcn", component: "button" },
      "packages/ui/src/molecules/form-errors.tsx": {
        registry: "custom",
        reference: "https://example.test/guide",
        rationale: "unapproved source",
      },
    },
    componentFiles: ["packages/ui/src/atoms/button.tsx", "packages/ui/src/molecules/form-errors.tsx"],
  });
  expect(findings.map(({ rule }) => rule)).toEqual(
    expect.arrayContaining(["REGISTRY_ALLOWLIST", "REGISTRY_CONFIG", "UI_SOURCE_INVALID", "UI_SOURCE_STALE"]),
  );
});

test("vendored component catalog requires matching files, MIT notices and a pinned upstream commit", () => {
  const commit = "a".repeat(40);
  const base = {
    packageName: "email" as const,
    upstreamCommit: commit,
    components: {
      "src/atoms/button.tsx": {
        registry: "@emailcn",
        source: `https://github.com/shadcn-labs/emailcn/blob/${commit}/registry/button.tsx`,
        license: "MIT",
        adaptation: "Uses package-local imports.",
      },
    },
    sourceFiles: ["packages/email/src/atoms/button.tsx"],
  };
  expect(validateVendoredSourceCatalog(base)).toEqual([]);
  expect(
    validateVendoredSourceCatalog({
      ...base,
      components: {
        ...base.components,
        "src/atoms/missing.tsx": { ...base.components["src/atoms/button.tsx"], license: "UNKNOWN" },
      },
      sourceFiles: base.sourceFiles,
    }).map(({ rule }) => rule),
  ).toEqual(expect.arrayContaining(["UI_SOURCE_STALE", "VENDORED_SOURCE_INVALID"]));
});
