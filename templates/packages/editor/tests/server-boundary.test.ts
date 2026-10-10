import { describe, expect, test } from "bun:test";
import { RichTextEditor } from "@loom/editor/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("editor server boundary", () => {
  test("renders only the server fallback without evaluating the Lexical client module", () => {
    const markup = renderToStaticMarkup(
      createElement(RichTextEditor, {
        serverFallback: createElement("p", null, "Editor loads in the browser"),
      }),
    );

    expect(markup).toBe("<p>Editor loads in the browser</p>");
  });
});
