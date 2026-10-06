import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import type { RichTextEditorProps } from "./types";

const ClientRichTextEditor = lazy(() => import("./client").then(({ RichTextEditor }) => ({ default: RichTextEditor })));

export interface LazyRichTextEditorProps extends RichTextEditorProps {
  /** Content shown while the client module loads. */
  loadingFallback?: ReactNode;
  /** Optional server-rendered placeholder. Defaults to `null`. */
  serverFallback?: ReactNode;
}

/**
 * Browser-only React entrypoint. The Lexical module is requested after mount, so server
 * rendering does not evaluate the editor implementation.
 */
export function RichTextEditor({ loadingFallback = null, serverFallback = null, ...props }: LazyRichTextEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return serverFallback;

  return (
    <Suspense fallback={loadingFallback}>
      <ClientRichTextEditor {...props} />
    </Suspense>
  );
}

/** Load the composable client primitives from an effect or client-only route boundary. */
export function loadEditorComponents() {
  return import("./client");
}
