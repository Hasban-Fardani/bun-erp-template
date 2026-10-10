import { join } from "node:path";
import { fileIndex } from "../lib/file-index.ts";
import { directoryExists } from "./exists.ts";

/** Above this many options, a list must be searchable. */
const MAX_SELECT_OPTIONS = 3;
const BANNED_NATIVE: readonly { pattern: RegExp; shadcn: string }[] = [
  { pattern: /<select[\s>]/, shadcn: "Select (@loom/ui/molecules/select.tsx)" },
  { pattern: /<input[^>]*type="checkbox"/, shadcn: "Checkbox from the approved registry" },
  { pattern: /<input[^>]*type="radio"/, shadcn: "RadioGroup from the approved registry" },
];

export type ShadcnFinding = { file: string; line: number; rule: string; detail: string };
type Registry = { name: string; url: string; purpose?: string };
type Source = {
  registry: string;
  component?: string;
  reference?: string;
  rationale?: string;
  license?: string;
  upstream?: string;
  adaptation?: string;
};

const APPROVED_REGISTRIES = new Map([
  ["@shadcn", "https://ui.shadcn.com/r/styles/new-york-v4/{name}.json"],
  ["@dashboardcn", "https://dashboardcn.com/r/{name}.json"],
  ["@dashboardblocks", "https://www.dashboardblocks.com/r/{name}.json"],
  ["@emailcn", "https://emailcn.run/r/{name}.json"],
  ["@pdfcn", "https://pdfcn.dev/r/{name}.json"],
]);
const APPROVED_UPSTREAMS = new Map([
  ["@dashboardcn", "https://github.com/NoahGdev/dashboardcn"],
  ["@dashboardblocks", "https://github.com/LGLabGreg/dashboardblocks"],
  ["@emailcn", "https://github.com/shadcn-labs/emailcn"],
  ["@pdfcn", "https://github.com/shadcn-labs/pdfcn"],
]);

/** Contract logic is exported separately so fixture tests can cover allowlist failures. */
export function validateRegistryContract(input: {
  allowed: Registry[];
  configured: Record<string, string>;
  sources: Record<string, Source>;
  componentFiles: string[];
  shadcnUpstreamCommit?: string;
}): ShadcnFinding[] {
  const findings: ShadcnFinding[] = [];
  const allowed = new Map(input.allowed.map((registry) => [registry.name, registry.url]));
  if (
    allowed.size !== APPROVED_REGISTRIES.size ||
    [...APPROVED_REGISTRIES].some(([name, url]) => allowed.get(name) !== url)
  ) {
    findings.push({
      file: "packages/ui/registry-allowlist.json",
      line: 1,
      rule: "REGISTRY_ALLOWLIST",
      detail:
        "The allowlist must exactly match the reviewed shadcn, Dashboardcn, Dashboardblocks, emailcn and pdfcn registries.",
    });
  }
  if (
    Object.keys(input.configured).length !== allowed.size ||
    Object.entries(input.configured).some(([name, url]) => allowed.get(name) !== url)
  ) {
    findings.push({
      file: "packages/ui/components.json",
      line: 1,
      rule: "REGISTRY_CONFIG",
      detail: "Configured registries must exactly match registry-allowlist.json.",
    });
  }

  const files = new Set(input.componentFiles);
  for (const file of files) {
    const source = input.sources[file];
    if (!source) {
      findings.push({
        file,
        line: 1,
        rule: "UI_SOURCE_UNREVIEWED",
        detail: "Inspect an approved reference and record its source.",
      });
      continue;
    }
    if (source.registry !== "custom" && allowed.has(source.registry)) {
      const expectedReference = allowed.get(source.registry)?.replace("{name}", source.component ?? "");
      const isPinnedShadcnSource =
        source.registry !== "@shadcn" ||
        (source.reference === expectedReference &&
          source.license === "MIT" &&
          !!source.upstream &&
          !!input.shadcnUpstreamCommit &&
          source.upstream.startsWith(
            `https://github.com/shadcn-ui/ui/blob/${input.shadcnUpstreamCommit}/apps/v4/registry/new-york-v4/ui/`,
          ) &&
          !!source.adaptation?.trim());
      if (
        !source.component ||
        !/^[-a-z0-9]+(?:\/[-a-z0-9]+)*$/.test(source.component) ||
        !isPinnedShadcnSource ||
        (source.registry !== "@shadcn" &&
          (source.reference !== expectedReference ||
            source.license !== "MIT" ||
            !source.upstream ||
            (source.upstream !== APPROVED_UPSTREAMS.get(source.registry) &&
              !source.upstream.startsWith(`${APPROVED_UPSTREAMS.get(source.registry)}/`))))
      ) {
        findings.push({
          file,
          line: 1,
          rule: "UI_SOURCE_INVALID",
          detail: "Registry components must use an approved item URL and record MIT licensing and upstream provenance.",
        });
      }
      continue;
    }
    if (
      source.registry !== "custom" ||
      !source.reference ||
      !/^(?:https:\/\/ui\.shadcn\.com\/(?:docs\/components\/|docs\/typeset$|blocks\/)|https:\/\/tanstack\.com\/(?:form|table)\/)/.test(
        source.reference,
      ) ||
      !source.rationale?.trim()
    ) {
      findings.push({
        file,
        line: 1,
        rule: "UI_SOURCE_INVALID",
        detail: "Custom components need an official reference and a concrete rationale.",
      });
    }
  }
  for (const file of Object.keys(input.sources)) {
    if (!files.has(file))
      findings.push({
        file,
        line: 1,
        rule: "UI_SOURCE_STALE",
        detail: "Remove source metadata for a component that no longer exists.",
      });
  }
  return findings;
}

export function validateVendoredSourceCatalog(input: {
  packageName: "email" | "pdf";
  upstreamCommit: string;
  components: Record<string, { registry: string; source: string; license: string; adaptation?: string }>;
  sourceFiles: string[];
}): ShadcnFinding[] {
  const findings: ShadcnFinding[] = [];
  const packagePath = `packages/${input.packageName}`;
  const registry = input.packageName === "email" ? "@emailcn" : "@pdfcn";
  const repo = input.packageName === "email" ? "emailcn" : "pdfcn";
  const expectedSourcePrefix = `https://github.com/shadcn-labs/${repo}/blob/${input.upstreamCommit}/`;
  const files = new Set(input.sourceFiles);

  if (!/^[a-f0-9]{40}$/.test(input.upstreamCommit)) {
    findings.push({
      file: `${packagePath}/component-sources.json`,
      line: 1,
      rule: "UPSTREAM_COMMIT",
      detail: "Pin a 40-character upstream commit.",
    });
  }
  for (const [relativePath, source] of Object.entries(input.components)) {
    const file = `${packagePath}/${relativePath}`;
    if (!files.has(file)) {
      findings.push({ file, line: 1, rule: "UI_SOURCE_STALE", detail: "Source catalog entry has no vendored file." });
    }
    if (
      source.registry !== registry ||
      source.license !== "MIT" ||
      !source.source.startsWith(expectedSourcePrefix) ||
      !source.adaptation?.trim()
    ) {
      findings.push({
        file,
        line: 1,
        rule: "VENDORED_SOURCE_INVALID",
        detail: `Vendored source must use ${registry}, retain its MIT notice, point at the pinned ${repo} commit, and explain adaptation.`,
      });
    }
  }
  for (const file of files) {
    const relative = file.slice(`${packagePath}/`.length);
    if (!input.components[relative]) {
      findings.push({
        file,
        line: 1,
        rule: "UI_SOURCE_UNREVIEWED",
        detail: "Add pinned upstream provenance to the package catalog.",
      });
    }
  }
  return findings;
}

export async function checkShadcn(root: string): Promise<ShadcnFinding[]> {
  const findings: ShadcnFinding[] = [];
  const index = fileIndex(root);
  const allowlist = (await Bun.file(join(root, "packages/ui/registry-allowlist.json")).json()) as {
    allowed: Registry[];
  };
  const config = (await Bun.file(join(root, "packages/ui/components.json")).json()) as {
    registries?: Record<string, string>;
  };
  const inventory = (await Bun.file(join(root, "packages/ui/component-sources.json")).json()) as {
    components: Record<string, Source>;
    upstreamCommit: string;
  };
  const dashboard = (await Bun.file(join(root, "packages/ui/dashboard-sources.json")).json()) as Record<string, Source>;
  const tanstack = (await Bun.file(join(root, "packages/ui/tanstack-sources.json")).json()) as {
    components: Record<string, Source>;
  };
  const componentFiles = await index.files("packages/ui/src/**/*.tsx");
  const mergedSources = {
    ...inventory.components,
    ...Object.fromEntries(Object.entries(dashboard).map(([path, source]) => [`packages/ui/${path}`, source])),
    ...tanstack.components,
  };
  findings.push(
    ...validateRegistryContract({
      allowed: allowlist.allowed,
      configured: config.registries ?? {},
      sources: mergedSources,
      componentFiles,
      shadcnUpstreamCommit: inventory.upstreamCommit,
    }),
  );

  if (!(await Bun.file(join(root, "packages/ui/LICENSE.upstream")).exists())) {
    findings.push({
      file: "packages/ui/LICENSE.upstream",
      line: 1,
      rule: "UPSTREAM_LICENSE_MISSING",
      detail: "Preserve the official shadcn/ui MIT license with vendored components.",
    });
  }

  for (const packageName of ["email", "pdf"] as const) {
    const catalogPath = join(root, `packages/${packageName}/component-sources.json`);
    // These packages are opt-in: they live in templates/packages until `bun loom packages:install`
    // copies one into the workspace. Provenance is checked once the package is actually installed.
    if (!(await Bun.file(catalogPath).exists())) continue;
    const catalog = (await Bun.file(catalogPath).json()) as {
      upstreamCommit: string;
      components: Parameters<typeof validateVendoredSourceCatalog>[0]["components"];
    };
    const sourceFiles = (await index.files(`packages/${packageName}/src/**/*.{ts,tsx}`)).filter(
      (file) => file !== `packages/${packageName}/src/render.ts`,
    );
    findings.push(...validateVendoredSourceCatalog({ packageName, ...catalog, sourceFiles }));
    if (!(await Bun.file(join(root, `packages/${packageName}/LICENSE.upstream`)).exists())) {
      findings.push({
        file: `packages/${packageName}/LICENSE.upstream`,
        line: 1,
        rule: "UPSTREAM_LICENSE_MISSING",
        detail: "Preserve the upstream MIT license with vendored components.",
      });
    }
  }

  for (const sourceDir of ["apps/web/src", "apps/mobile/src"]) {
    const appSource = join(root, sourceDir);
    // Mobile is a catalog app: the default template has no apps/mobile/src to scan.
    if (!(await directoryExists(appSource))) continue;
    for (const path of await index.files(`${sourceDir}/**/*.tsx`)) {
      const code = await index.text(path);
      const lines = code.split("\n");
      lines.forEach((line, lineNumber) => {
        for (const { pattern, shadcn } of BANNED_NATIVE) {
          if (pattern.test(line))
            findings.push({
              file: path,
              line: lineNumber + 1,
              rule: "NATIVE_COMPONENT",
              detail: `native element where shadcn already ships one — use ${shadcn}`,
            });
        }
      });
      findings.push(...oversizedLists(path, code));
    }
  }
  return findings;
}

function oversizedLists(file: string, code: string): ShadcnFinding[] {
  const findings: ShadcnFinding[] = [];
  const countIn = (text: string) => (text.match(/\{\s*value:/g) ?? []).length;
  for (const match of code.matchAll(/SimpleSelect[\s\S]{0,400}?options=\{\[([\s\S]*?)\]\}/g)) {
    const count = countIn(match[1] ?? "");
    if (count > MAX_SELECT_OPTIONS)
      findings.push({
        file,
        line: lineOf(code, match.index ?? 0),
        rule: "SELECT_TOO_MANY_OPTIONS",
        detail: `${count} options exceeds ${MAX_SELECT_OPTIONS} — use Combobox (@loom/ui/organisms/combobox.tsx)`,
      });
  }
  for (const match of code.matchAll(/<Select[\s>][\s\S]*?<\/Select>/g)) {
    const count = (match[0].match(/<SelectItem/g) ?? []).length;
    if (count > MAX_SELECT_OPTIONS)
      findings.push({
        file,
        line: lineOf(code, match.index ?? 0),
        rule: "SELECT_TOO_MANY_OPTIONS",
        detail: `${count} options exceeds ${MAX_SELECT_OPTIONS} — use Combobox (@loom/ui/organisms/combobox.tsx)`,
      });
  }
  return findings;
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}
