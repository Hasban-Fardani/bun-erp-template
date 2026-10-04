import type { ReactElement } from "react";

/** Keep renderer dependencies outside application entry bundles until email generation is requested. */
export async function renderEmailDocument(document: ReactElement): Promise<string> {
  const { render } = await import("@react-email/render");
  return render(document);
}
