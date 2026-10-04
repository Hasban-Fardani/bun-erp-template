# `@bun-erp/editor`

An independently authored React rich text editor package for web and Capacitor mobile applications. It uses [Lexical](https://github.com/facebook/lexical), which publishes its [MIT license](https://github.com/facebook/lexical/blob/main/LICENSE). The checked `htmujahid/shadcn-editor` repository root and package metadata did not identify a license, so that project informed the requested composable API and toolbar direction only; no source from it is included here.

The persisted value is canonical Lexical JSON (`EditorJSON`). The package does not use HTML as its storage format. The baseline toolbar provides paragraph and heading styles, bold, italic, underline, strikethrough, ordered and unordered lists, quote formatting, links, undo, and redo. Toolbar controls use accessible names, visible keyboard focus, pressed states where applicable, and touch-friendly targets. Applications can localize the editor name and placeholder through props.

## Root integration

Add `packages/editor` to the Bun workspace, then run `bun install` from the repository root so the lockfile records these exact dependencies:

```json
{
  "@lexical/link": "0.52.0",
  "@lexical/list": "0.52.0",
  "@lexical/react": "0.52.0",
  "@lexical/rich-text": "0.52.0",
  "@lexical/selection": "0.52.0",
  "lexical": "0.52.0"
}
```

The package peers on the repository's exact React versions, `react@19.3.0` and `react-dom@19.3.0`. Add `@bun-erp/editor: "workspace:*"` only to browser application workspaces that use the editor. Keep it out of server and Worker dependency graphs.

Package development and type checks use the exact type-only dev dependencies `@types/react@19.1.8` and `@types/react-dom@19.1.7`.

## Usage

The root `@bun-erp/editor` entry exports types only, so importing the JSON contract does not execute React or Lexical code. For a standard editor, use the lazy browser entrypoint:

```tsx
import { RichTextEditor } from "@bun-erp/editor/react";
import type { EditorJSON } from "@bun-erp/editor";

function NotesEditor({ value, save }: { value?: EditorJSON; save: (value: EditorJSON) => void }) {
  return (
    <RichTextEditor
      key="customer-notes"
      initialValue={value}
      onChange={save}
      ariaLabel="Customer notes"
      placeholder="Write a note…"
    />
  );
}
```

The lazy component returns `serverFallback` (or `null`) during server rendering and imports Lexical after the browser component mounts. `loadingFallback` can provide an app-specific loading state. Browser applications may import `@bun-erp/editor/styles.css` globally when their bundler does not preserve CSS from a dynamic import.

For a custom toolbar, load the client primitives behind a client-only boundary, then compose them inside `EditorProvider`:

```tsx
import {
  EditorBlockFormatSelect,
  EditorContent,
  EditorFormatButton,
  EditorHistoryButton,
  EditorLinkControl,
  EditorListButton,
  EditorProvider,
  EditorToolbar,
} from "@bun-erp/editor/client";

function CustomEditor() {
  return (
    <EditorProvider ariaLabel="Article body" placeholder="Write the article…">
      <EditorToolbar ariaLabel="Article formatting">
        <EditorBlockFormatSelect />
        <EditorFormatButton format="bold" />
        <EditorFormatButton format="italic" />
        <EditorFormatButton format="underline" />
        <EditorFormatButton format="strikethrough" />
        <EditorListButton listType="bullet" />
        <EditorListButton listType="number" />
        <EditorLinkControl />
        <EditorHistoryButton action="undo" />
        <EditorHistoryButton action="redo" />
      </EditorToolbar>
      <EditorContent />
    </EditorProvider>
  );
}
```

`@bun-erp/editor/client` is browser-only and should be imported lazily by route/component boundaries. Never import it from Hono, server, or Cloudflare Worker code. `loadEditorComponents()` from the `/react` entrypoint can be used to load the same composable exports from an effect or client-only route.

`initialValue` is read only when an editor mounts. Remount with a new React `key` when switching documents; subsequent edits are reported through `onChange` as JSON. Links accept HTTP(S), `mailto:`, `tel:`, fragments, and relative URLs. Script and data protocols are rejected.

## Checks

Run the package's focused URL validation tests with `bun test packages/editor/tests`.
