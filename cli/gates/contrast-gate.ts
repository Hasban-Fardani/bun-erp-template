import { fileIndex } from "../lib/file-index.ts";

const requiredPairs = [
  ["color-background", "color-foreground"],
  ["color-surface", "color-foreground"],
  ["color-accent", "color-accent-ink"],
  ["color-surface", "color-accent"],
  ["color-background", "color-accent"],
  ["color-accent-soft", "color-accent-soft-foreground"],
  ["color-sidebar", "color-sidebar-foreground"],
  ["color-sidebar-accent", "color-sidebar-accent-foreground"],
] as const;

type Rgb = readonly [number, number, number];

function declarations(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()]),
  );
}

function cssBlock(source: string, selector: RegExp): string | undefined {
  return selector.exec(source)?.[1];
}

function parseHexColor(value: string): Rgb | undefined {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex) return undefined;
  const normalized = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}

function resolveColor(name: string, palette: Map<string, string>, seen = new Set<string>()): Rgb | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const value = palette.get(`--${name}`);
  if (!value) return undefined;
  const reference = value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (reference) return resolveColor(reference.slice(2), palette, seen);
  return parseHexColor(value);
}

function luminance([red, green, blue]: Rgb): number {
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

export function contrastRatio(foreground: string, background: string): number | undefined {
  const foregroundColor = parseHexColor(foreground);
  const backgroundColor = parseHexColor(background);
  if (!foregroundColor || !backgroundColor) return undefined;
  const values = [luminance(foregroundColor), luminance(backgroundColor)].sort((left, right) => right - left);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

function checkPalette(label: string, palette: Map<string, string>): string[] {
  return requiredPairs.flatMap(([background, foreground]) => {
    const backgroundColor = resolveColor(background, palette);
    const foregroundColor = resolveColor(foreground, palette);
    if (!backgroundColor || !foregroundColor) {
      return [`${label}: cannot resolve --${foreground} on --${background}; use supported hex theme tokens`];
    }
    const rgbToHex = ([red, green, blue]: Rgb) =>
      `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    const ratio = contrastRatio(rgbToHex(foregroundColor), rgbToHex(backgroundColor));
    if (ratio === undefined || ratio < 4.5) {
      return [
        `${label}: --${foreground} on --${background} is ${ratio?.toFixed(2) ?? "unknown"}:1; WCAG AA requires 4.5:1`,
      ];
    }
    return [];
  });
}

export function checkActiveNavigationContrast(
  source: string,
  file = "apps/web/src/templates/authenticated-layout.tsx",
): string[] {
  const background = /targetUrl\s*===\s*activeUrl\s*\?\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']/.exec(source);
  const foreground =
    /highlighted\s*\?\s*active\s*\?\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']\s*:\s*active\s*\?\s*["']([^"']+)["']/s.exec(
      source,
    );
  if (
    !background ||
    !foreground ||
    !/\bbg-accent\b/.test(background[1] ?? "") ||
    !/\bbg-accent-soft\b/.test(background[2] ?? "") ||
    !/\btext-accent-ink\b/.test(foreground[1] ?? "") ||
    !/\btext-accent-soft-foreground\b/.test(foreground[2] ?? "") ||
    !/\btext-accent\b/.test(foreground[3] ?? "")
  ) {
    return [`${file}: moving navigation highlight needs readable foregrounds for active and hovered items`];
  }
  return [];
}

type ClassAlternative = { tokens: string[]; conditions: Map<string, boolean> };
type ColorUtility = { kind: "bg" | "text"; value: string; variants: string[]; index: number };
type ResolvedUtilityColor = { color: Rgb; opacity: number };

const EMPTY_ALTERNATIVE: ClassAlternative = { tokens: [], conditions: new Map() };
const TYPOGRAPHY_UTILITIES = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
]);

function mergeAlternatives(left: ClassAlternative[], right: ClassAlternative[]): ClassAlternative[] {
  const merged: ClassAlternative[] = [];
  for (const first of left) {
    for (const second of right) {
      if (conditionsConflict(first.conditions, second.conditions)) continue;
      merged.push({
        tokens: [...first.tokens, ...second.tokens],
        conditions: new Map([...first.conditions, ...second.conditions]),
      });
      if (merged.length >= 128) return merged;
    }
  }
  return merged.length > 0 ? merged : [EMPTY_ALTERNATIVE];
}

function conditionsConflict(left: Map<string, boolean>, right: Map<string, boolean>): boolean {
  for (const [condition, value] of left) {
    if (right.has(condition) && right.get(condition) !== value) return true;
  }

  const equalities = [...left, ...right]
    .filter(
      ([condition, value]) =>
        value && /^\s*[\w$.]+\s*===?\s*(?:['"`][^'"`]+['"`]|true|false|null|-?\d+)\s*$/.test(condition),
    )
    .map(([condition]) => {
      const match = /^\s*([\w$.]+)\s*===?\s*(?:(['"`])([^'"`]+)\2|(true|false|null|-?\d+))\s*$/.exec(condition);
      return match ? [match[1] ?? "", match[3] ?? match[4] ?? ""] : undefined;
    })
    .filter((equality): equality is [string, string] => equality !== undefined);

  return equalities.some(([subject, value], index) =>
    equalities.slice(index + 1).some(([otherSubject, otherValue]) => subject === otherSubject && value !== otherValue),
  );
}

function splitTopLevel(expression: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index] ?? "";
    const next = expression[index + 1] ?? "";
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (char === "'" || char === '"' || char === "`") quote = char;
    else if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    else if (expression.startsWith(delimiter, index) && round === 0 && square === 0 && curly === 0) {
      parts.push(expression.slice(start, index).trim());
      start = index + delimiter.length;
      index += delimiter.length - 1;
    }
  }
  parts.push(expression.slice(start).trim());
  return parts;
}

function unwrapString(expression: string): string | undefined {
  const value = expression.trim();
  const quote = value[0];
  if ((quote !== "'" && quote !== '"' && quote !== "`") || value.at(-1) !== quote) return undefined;
  return value
    .slice(1, -1)
    .replace(/\\([\\'"`])/g, "$1")
    .replace(/\$\{[^}]*\}/g, " ");
}

function findTopLevelTernary(expression: string): [condition: string, whenTrue: string, whenFalse: string] | undefined {
  let round = 0;
  let square = 0;
  let curly = 0;
  let quote = "";
  let escaped = false;
  let questionIndex = -1;
  let nested = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index] ?? "";
    const next = expression[index + 1] ?? "";
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") quote = char;
    else if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "{") curly += 1;
    else if (char === "}") curly -= 1;
    else if (round === 0 && square === 0 && curly === 0 && char === "?" && next !== "?" && next !== ".") {
      if (questionIndex < 0) questionIndex = index;
      else nested += 1;
    } else if (round === 0 && square === 0 && curly === 0 && char === ":" && questionIndex >= 0) {
      if (nested === 0) {
        const whenTrue = expression.slice(questionIndex + 1, index).trim();
        const whenFalse = expression.slice(index + 1).trim();
        if (!whenTrue || !whenFalse) return undefined;
        return [expression.slice(0, questionIndex).trim(), whenTrue, whenFalse];
      }
      nested -= 1;
    }
  }
  return undefined;
}

function callArguments(expression: string): string[] | undefined {
  const value = expression.trim();
  const open = value.indexOf("(");
  if (open <= 0 || !value.endsWith(")") || !/^[\w$.]+$/.test(value.slice(0, open).trim())) return undefined;
  const args = value.slice(open + 1, -1).trim();
  return args ? splitTopLevel(args, ",") : [];
}

function classAlternatives(expression: string): ClassAlternative[] {
  let value = expression.trim();
  if (!value) return [EMPTY_ALTERNATIVE];
  if (value.startsWith("(") && value.endsWith(")")) value = value.slice(1, -1).trim();
  const literal = unwrapString(value);
  if (literal !== undefined) return [{ tokens: literal.split(/\s+/).filter(Boolean), conditions: new Map() }];

  const ternary = findTopLevelTernary(value);
  if (ternary) {
    const [condition, whenTrue, whenFalse] = ternary;
    const branch = (source: string, result: boolean) =>
      classAlternatives(source).map((alternative) => ({
        ...alternative,
        conditions: new Map([...alternative.conditions, [condition, result]]),
      }));
    return [...branch(whenTrue, true), ...branch(whenFalse, false)];
  }

  const conjunction = splitTopLevel(value, "&&");
  if (conjunction.length > 1) {
    const [condition = "", ...remaining] = conjunction;
    const rest = remaining.join(" && ");
    return [
      ...classAlternatives(rest).map((alternative) => ({
        ...alternative,
        conditions: new Map([...alternative.conditions, [condition, true]]),
      })),
      { tokens: [], conditions: new Map([[condition, false]]) },
    ];
  }

  const args = callArguments(value);
  if (args) {
    return args.reduce(
      (alternatives, argument) => mergeAlternatives(alternatives, classAlternatives(argument)),
      [EMPTY_ALTERNATIVE],
    );
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitTopLevel(value.slice(1, -1), ",").reduce(
      (alternatives, item) => mergeAlternatives(alternatives, classAlternatives(item)),
      [EMPTY_ALTERNATIVE],
    );
  }

  const quoted: string[] = [];
  let quote = "";
  let start = -1;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (!quote && (char === "'" || char === '"' || char === "`")) {
      quote = char;
      start = index;
      escaped = false;
    } else if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) {
        const content = unwrapString(value.slice(start, index + 1));
        if (content !== undefined) quoted.push(content);
        quote = "";
        start = -1;
      }
    }
  }
  const tokens = quoted.flatMap((text) => text.split(/\s+/).filter(Boolean));
  return [{ tokens, conditions: new Map() }];
}

function classNameExpressions(source: string): string[] {
  const expressions: string[] = [];
  const attribute = /\bclassName\s*=\s*/g;
  for (let match = attribute.exec(source); match; match = attribute.exec(source)) {
    const start = attribute.lastIndex;
    const opener = source[start];
    if (opener === "'" || opener === '"' || opener === "`") {
      let escaped = false;
      for (let index = start + 1; index < source.length; index += 1) {
        const char = source[index] ?? "";
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === opener) {
          expressions.push(source.slice(start, index + 1));
          attribute.lastIndex = index + 1;
          break;
        }
      }
      continue;
    }
    if (opener !== "{") continue;
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index] ?? "";
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
        continue;
      }
      if (char === "'" || char === '"' || char === "`") quote = char;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          expressions.push(source.slice(start + 1, index));
          attribute.lastIndex = index + 1;
          break;
        }
      }
    }
  }
  return expressions;
}

function colorUtilities(tokens: string[]): ColorUtility[] {
  return tokens.flatMap((token, index) => {
    const parts: string[] = [];
    let start = 0;
    let square = 0;
    let quote = "";
    let escaped = false;
    for (let cursor = 0; cursor < token.length; cursor += 1) {
      const char = token[cursor] ?? "";
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
      } else if (char === "'" || char === '"') quote = char;
      else if (char === "[") square += 1;
      else if (char === "]") square -= 1;
      else if (char === ":" && square === 0) {
        parts.push(token.slice(start, cursor));
        start = cursor + 1;
      }
    }
    parts.push(token.slice(start));
    const utility = (parts.pop() ?? "").replace(/^!/, "");
    const match = /^(bg|text)-(.+)$/.exec(utility);
    if (!match) return [];
    const kind = match[1] as ColorUtility["kind"];
    const value = match[2] ?? "";
    const pseudoElementVariants = new Set([
      "after",
      "backdrop",
      "before",
      "file",
      "first-letter",
      "first-line",
      "marker",
      "placeholder",
      "selection",
    ]);
    if (
      parts.some(
        (variant) =>
          variant.startsWith("[") ||
          pseudoElementVariants.has(variant) ||
          (variant.includes("[") && !/^(?:data|aria|group-data|peer-data)-/.test(variant)),
      )
    ) {
      return [];
    }
    if (
      kind === "text" &&
      (TYPOGRAPHY_UTILITIES.has(value) ||
        value === "inherit" ||
        value === "current" ||
        /^\[(?:CanvasText|inherit|currentColor)\]$/i.test(value) ||
        /^\[(?:\d+(?:\.\d+)?)(?:px|rem|em|vh|vw)\]$/.test(value))
    ) {
      return [];
    }
    return [{ kind, value, variants: parts, index }];
  });
}

function utilityColor(value: string, palette: Map<string, string>): ResolvedUtilityColor | undefined {
  const [colorValue, opacityValue] = value.split("/");
  const opacity = opacityValue === undefined ? 1 : Number(opacityValue) / 100;
  if (!colorValue || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) return undefined;
  let color: Rgb | undefined;
  if (colorValue === "white") color = [255, 255, 255];
  else if (colorValue === "black") color = [0, 0, 0];
  else if (colorValue === "transparent") {
    color = [0, 0, 0];
    return { color, opacity: 0 };
  } else {
    const arbitrary = colorValue.match(/^\[(?:color:)?var\((--[\w-]+)\)\]$/)?.[1];
    const hex = colorValue.match(/^\[#([\da-f]{3}|[\da-f]{6})\]$/i)?.[1];
    color = arbitrary
      ? resolveColor(arbitrary.slice(2), palette)
      : hex
        ? parseHexColor(`#${hex}`)
        : resolveColor(`color-${colorValue}`, palette);
  }
  return color ? { color, opacity } : undefined;
}

function composite(foreground: Rgb, background: Rgb, opacity: number): Rgb {
  return foreground.map((channel, index) =>
    Math.round(channel * opacity + (background[index] ?? 0) * (1 - opacity)),
  ) as unknown as Rgb;
}

function colorContexts(utilities: ColorUtility[]): Set<string>[] {
  const variants = [...new Set(utilities.flatMap((utility) => utility.variants))];
  if (variants.length <= 6) {
    return Array.from(
      { length: 2 ** variants.length },
      (_, mask) => new Set(variants.filter((_, index) => (mask & (1 << index)) !== 0)),
    );
  }
  return [new Set(), ...utilities.map((utility) => new Set(utility.variants))];
}

function effectiveColorUtility(
  utilities: ColorUtility[],
  kind: ColorUtility["kind"],
  context: Set<string>,
): ColorUtility | undefined {
  return utilities
    .filter((utility) => utility.kind === kind && utility.variants.every((variant) => context.has(variant)))
    .sort((left, right) => left.variants.length - right.variants.length || left.index - right.index)
    .at(-1);
}

function checkColorAlternative(
  file: string,
  alternative: ClassAlternative,
  lightPalette: Map<string, string>,
  darkPalette: Map<string, string>,
): string[] {
  const utilities = colorUtilities(alternative.tokens);
  if (!utilities.some((utility) => utility.kind === "bg") || !utilities.some((utility) => utility.kind === "text")) {
    return [];
  }
  const findings = new Set<string>();
  for (const [theme, palette] of [
    ["light", lightPalette],
    ["dark", darkPalette],
  ] as const) {
    for (const context of colorContexts(utilities)) {
      if (theme === "light" && context.has("dark")) continue;
      const background = effectiveColorUtility(utilities, "bg", context);
      const foreground = effectiveColorUtility(utilities, "text", context);
      if (!background || !foreground) continue;
      if (/^(?:transparent|inherit|current)(?:\/\d+)?$/.test(background.value)) continue;
      const backgroundColor = utilityColor(background.value, palette);
      const foregroundColor = utilityColor(foreground.value, palette);
      const state = [...context].join("+") || "default";
      if (!backgroundColor || !foregroundColor) {
        findings.add(
          `${file}: ${theme} ${state} text color pair ${foreground.value} on ${background.value} cannot be verified; use theme color tokens or solid named colors`,
        );
        continue;
      }
      if (backgroundColor.opacity === 0) continue;
      const possibleBackgrounds =
        backgroundColor.opacity < 1
          ? [resolveColor("color-surface", palette), resolveColor("color-background", palette)].filter(
              (color): color is Rgb => Boolean(color),
            )
          : [backgroundColor.color];
      const ratios = possibleBackgrounds.map((base) => {
        const displayedBackground = composite(backgroundColor.color, base, backgroundColor.opacity);
        const displayedForeground = composite(foregroundColor.color, displayedBackground, foregroundColor.opacity);
        const toHex = (color: Rgb) => `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
        return contrastRatio(toHex(displayedForeground), toHex(displayedBackground));
      });
      const minimumRatio = Math.min(...ratios.filter((ratio): ratio is number => ratio !== undefined));
      if (!Number.isFinite(minimumRatio) || minimumRatio < 4.5) {
        findings.add(
          `${file}: ${theme} ${state} text color pair ${foreground.value} on ${background.value} is ${Number.isFinite(minimumRatio) ? minimumRatio.toFixed(2) : "unknown"}:1; WCAG AA requires 4.5:1`,
        );
      }
    }
  }
  return [...findings];
}

export function checkComponentClassContrast(source: string, file: string, stylesheet: string): string[] {
  const lightBlock = cssBlock(stylesheet, /@theme\s*\{([\s\S]*?)\n\}/);
  const darkBlock = cssBlock(stylesheet, /\[data-theme=["']dark["']\]\s*\{([\s\S]*?)\n\}/);
  if (!lightBlock || !darkBlock) return [`${file}: cannot verify class colors without light and dark theme tokens`];
  const lightPalette = declarations(lightBlock);
  const darkPalette = new Map([...lightPalette, ...declarations(darkBlock)]);
  const findings: string[] = [];
  for (const expression of classNameExpressions(source)) {
    for (const alternative of classAlternatives(expression)) {
      findings.push(...checkColorAlternative(file, alternative, lightPalette, darkPalette));
    }
  }
  return [...new Set(findings)];
}

export async function checkContrast(root: string): Promise<string[]> {
  const index = fileIndex(root);
  const stylesheetPath = `${root}/packages/ui/src/styles.css`;
  if (!(await Bun.file(stylesheetPath).exists())) {
    return ["packages/ui/src/styles.css: missing; theme-token contrast cannot be verified"];
  }
  const stylesheet = await index.text("packages/ui/src/styles.css");
  const lightBlock = cssBlock(stylesheet, /@theme\s*\{([\s\S]*?)\n\}/);
  const darkBlock = cssBlock(stylesheet, /\[data-theme=["']dark["']\]\s*\{([\s\S]*?)\n\}/);
  if (!lightBlock || !darkBlock) return ["packages/ui/src/styles.css: light and dark theme token blocks are required"];

  const lightPalette = declarations(lightBlock);
  const darkPalette = new Map([...lightPalette, ...declarations(darkBlock)]);
  // The web app ships empty: skip the navigation rule when there is no layout to check. The
  // catalog copy is the template's own UI, so it is checked the same way once installed.
  const navigation: string[] = [];
  for (const layoutPath of [
    "apps/web/src/templates/authenticated-layout.tsx",
    "templates/apps/web/src/templates/authenticated-layout.tsx",
  ]) {
    if (!(await Bun.file(`${root}/${layoutPath}`).exists())) continue;
    navigation.push(...checkActiveNavigationContrast(await Bun.file(`${root}/${layoutPath}`).text(), layoutPath));
  }

  // Installed apps, the shared UI package and every catalog copy: a template's catalog UI is the
  // surface most users copy, so leaving it unchecked let contrast regressions ship silently.
  const componentGlobs = [
    "apps/web/src/**/*.tsx",
    "apps/mobile/src/**/*.tsx",
    "packages/ui/src/**/*.tsx",
    "templates/apps/web/src/**/*.tsx",
    "templates/apps/mobile/src/**/*.tsx",
    "templates/features/*/web/**/*.tsx",
    "templates/packages/*/src/**/*.tsx",
  ];
  const componentFiles = await index.files(componentGlobs);
  const componentFindings = await Promise.all(
    componentFiles.map(async (file) => checkComponentClassContrast(await index.text(file), file, stylesheet)),
  );
  return [
    ...checkPalette("light theme", lightPalette),
    ...checkPalette("dark theme", darkPalette),
    ...navigation,
    ...componentFindings.flat(),
  ];
}
