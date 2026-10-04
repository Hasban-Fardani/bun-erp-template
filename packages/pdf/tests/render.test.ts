import { expect, test } from "bun:test";
import { createElement } from "react";

import { renderPdfDocument } from "../src/render";

test("rejects server rendering before loading the browser WASM renderer", async () => {
  await expect(renderPdfDocument(createElement("div"))).rejects.toThrow("unavailable during server rendering");
});
