import type { ReactNode } from "react";

/**
 * The small Markdown subset chat models actually emit: paragraphs, `-`/`1.` lists, **bold** and
 * `code`. Everything renders as React text, so model output can never inject HTML; a half-streamed
 * `**` simply shows as text until its closing pair arrives.
 */
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
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
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

export function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter((line) => line.trim() !== "");
        const key = `b${index}`;
        if (lines.length > 0 && lines.every((line) => BULLET.test(line))) {
          return (
            <ul key={key} className="list-disc space-y-1 pl-5">
              {lines.map((line, item) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: list items of one answer never reorder; they only grow.
                <li key={`${key}-${item}`}>{inline(line.replace(BULLET, ""), `${key}-${item}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.length > 0 && lines.every((line) => NUMBERED.test(line))) {
          return (
            <ol key={key} className="list-decimal space-y-1 pl-5">
              {lines.map((line, item) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: list items of one answer never reorder; they only grow.
                <li key={`${key}-${item}`}>{inline(line.replace(NUMBERED, ""), `${key}-${item}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={key} className="whitespace-pre-wrap">
            {inline(block, key)}
          </p>
        );
      })}
    </div>
  );
}
