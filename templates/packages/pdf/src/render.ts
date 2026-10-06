import type { ReactElement } from "react";

/** Load the WASM renderer only when a user explicitly requests a PDF export. */
export async function renderPdfDocument(document: ReactElement): Promise<Uint8Array> {
  if (typeof window === "undefined") {
    throw new Error("PDF export requires a browser renderer and is unavailable during server rendering.");
  }
  const [{ serialize }, renderer] = await Promise.all([import("@formepdf/react"), import("@formepdf/core/browser")]);
  const serialized = serialize(document) as unknown as Parameters<typeof renderer.renderSerializedDoc>[0];
  return renderer.renderSerializedDoc(serialized);
}
