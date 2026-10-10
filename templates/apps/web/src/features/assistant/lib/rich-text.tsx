import { useI18n } from "@loom/i18n/react";
import type { ReactNode } from "react";
import { CopyButton } from "../components/copy-button.tsx";

/**
 * The Markdown subset chat models actually emit: headings, paragraphs, `-`/`1.` lists, fenced code,
 * pipe tables, **bold**, `code` and links. Everything renders as React elements built from text, so
 * model output can never inject HTML; a half-streamed `**` or fence simply shows as text/code until
 * its closing pair arrives. Links open only for http(s) and mailto, always with `rel=noopener`.
 */

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).map((part, index) => {
    const id = `${key}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={id}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={id} className="rounded bg-background px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (href && SAFE_LINK.test(href)) {
        return (
          <a
            key={id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-soft-foreground underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {label}
          </a>
        );
      }
      return label;
    }
    return part;
  });
}

const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

type Block =
  | { kind: "code"; lang: string; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "table"; header: string[]; align: ("left" | "right" | "center")[]; rows: string[][] }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "p"; text: string };

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function alignment(cell: string): "left" | "right" | "center" {
  const starts = cell.startsWith(":");
  const ends = cell.endsWith(":");
  return starts && ends ? "center" : ends ? "right" : "left";
}

const startsBlock = (line: string) =>
  FENCE.test(line) || HEADING.test(line) || BULLET.test(line) || NUMBERED.test(line);

export function parseBlocks(source: string): Block[] {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1; // the closing fence; absent while the answer is still streaming
      blocks.push({ kind: "code", lang: fence[1] ?? "", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
      index += 1;
      continue;
    }
    if (line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "") && (lines[index + 1] ?? "").includes("-")) {
      const header = cells(line);
      const align = cells(lines[index + 1] ?? "").map(alignment);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim() !== "") {
        rows.push(cells(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "table", header, align, rows });
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const pattern = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(pattern, ""));
        index += 1;
      }
      blocks.push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      (paragraph.length === 0 || !startsBlock(lines[index] ?? ""))
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ kind: "p", text: paragraph.join("\n") });
  }
  return blocks;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const { t } = useI18n();
  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-background">
      <figcaption className="flex items-center justify-between border-b border-border px-3 py-0.5 text-[11.5px] text-ink-muted">
        <span className="font-mono">{lang || t("assistant.code")}</span>
        <CopyButton text={text} label={t("assistant.copyCode")} testId="code-copy" showLabel />
      </figcaption>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">
        <code>{text}</code>
      </pre>
    </figure>
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-3 [overflow-wrap:anywhere]">
      {blocks.map((block, position) => {
        const key = `b${position}`;
        switch (block.kind) {
          case "code":
            return <CodeBlock key={key} lang={block.lang} text={block.text} />;
          case "heading":
            return block.level <= 2 ? (
              <h3 key={key} className="pt-1 text-[15px] font-semibold text-ink">
                {inline(block.text, key)}
              </h3>
            ) : (
              <h4 key={key} className="pt-1 text-[14px] font-semibold text-ink">
                {inline(block.text, key)}
              </h4>
            );
          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead className="bg-background text-ink-soft">
                    <tr>
                      {block.header.map((cell, column) => (
                        <th
                          // biome-ignore lint/suspicious/noArrayIndexKey: table columns never reorder.
                          key={`${key}-h${column}`}
                          scope="col"
                          className="px-3 py-2 font-semibold"
                          style={{ textAlign: block.align[column] ?? "left" }}
                        >
                          {inline(cell, `${key}-h${column}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: rows of one answer only grow.
                      <tr key={`${key}-r${rowIndex}`} className="border-t border-border">
                        {row.map((cell, column) => (
                          <td
                            // biome-ignore lint/suspicious/noArrayIndexKey: table columns never reorder.
                            key={`${key}-r${rowIndex}-c${column}`}
                            className="px-3 py-2 align-top"
                            style={{ textAlign: block.align[column] ?? "left" }}
                          >
                            {inline(cell, `${key}-r${rowIndex}-c${column}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list items of one answer never reorder; they only grow.
                  <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list items of one answer never reorder; they only grow.
                  <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            );
          case "p":
            return (
              <p key={key} className="whitespace-pre-wrap">
                {inline(block.text, key)}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
