import { expect, test } from "bun:test";
import {
  checkActiveNavigationContrast,
  checkComponentClassContrast,
  checkContrast,
  contrastRatio,
} from "../../../cli/gates/contrast-gate.ts";

test("light text on the accent-soft surface fails WCAG AA", () => {
  expect(contrastRatio("#ffffff", "#ecfdf5")).toBeLessThan(4.5);
});

test("active navigation text must match its semantic background token", () => {
  const safe = `
    targetUrl === activeUrl ? "bg-accent shadow-sm" : "bg-accent-soft";
    highlighted ? active ? "text-accent-ink" : "text-accent-soft-foreground" : active ? "font-semibold text-accent" : "text-ink-soft";
  `;
  expect(checkActiveNavigationContrast(safe)).toEqual([]);
  expect(checkActiveNavigationContrast('active ? "bg-accent-soft text-accent-ink" : "text-ink"')).toHaveLength(1);
});

test("class-based text contrast checks light, dark, and hover states", async () => {
  const root = `${import.meta.dir}/../../..`;
  const stylesheet = await Bun.file(`${root}/packages/ui/src/styles.css`).text();
  const hiddenOnSoftSurface = checkComponentClassContrast(
    '<a className="bg-accent-soft text-accent-ink">Roles</a>',
    "fixture.tsx",
    stylesheet,
  );
  const lowContrastHover = checkComponentClassContrast(
    '<a className="bg-accent-soft text-accent-soft-foreground hover:bg-accent">Roles</a>',
    "fixture.tsx",
    stylesheet,
  );
  const safePair = checkComponentClassContrast(
    '<a className="bg-accent text-accent-ink hover:bg-accent">Roles</a>',
    "fixture.tsx",
    stylesheet,
  );
  const conditionalVariants = checkComponentClassContrast(
    '<button className={cn("rounded", variant === "primary" && "bg-accent text-accent-ink", variant === "danger" && "text-danger")}>Save</button>',
    "fixture.tsx",
    stylesheet,
  );
  const activeSoftPair = checkComponentClassContrast(
    '<a className="data-[active=true]:bg-accent-soft data-[active=true]:text-accent-soft-foreground">Roles</a>',
    "fixture.tsx",
    stylesheet,
  );
  const whiteOnSoftSurface = checkComponentClassContrast(
    '<a className="bg-accent-soft text-white">Roles</a>',
    "fixture.tsx",
    stylesheet,
  );
  expect(hiddenOnSoftSurface.length).toBeGreaterThan(0);
  expect(lowContrastHover.length).toBeGreaterThan(0);
  expect(safePair).toEqual([]);
  expect(conditionalVariants).toEqual([]);
  expect(activeSoftPair).toEqual([]);
  expect(whiteOnSoftSurface.length).toBeGreaterThan(0);
});

test("all required light and dark theme pairs meet WCAG AA", async () => {
  const root = `${import.meta.dir}/../../..`;
  expect(await checkContrast(root)).toEqual([]);
});
