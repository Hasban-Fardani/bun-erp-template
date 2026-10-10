# Shared PDF components

Vendored MIT Forme components from [pdfcn](https://www.pdfcn.dev/), with provenance pinned in component-sources.json and license preserved in LICENSE.upstream.

Import only the atomic component you need, for example `@loom/pdf/atoms/text` or `@loom/pdf/organisms/page-header`. Compose them inside Document and Page from @formepdf/react. Generic presentation components are installed; domain document examples and interactive form/table implementations are excluded.

Use `renderPdfDocument` from `@loom/pdf/render` only on an explicit export action. It dynamically loads the browser WASM renderer. Rendering is browser/mobile-webview only. The Cloudflare Worker must not import this package's components or renderer; server-side PDF generation is unsupported by this package.

The upstream provider uses a synchronous serializer theme scope; wrap each full document in PdfcnThemeProvider and serialize the full document in one operation. Do not render fragments independently with competing themes.

Native WebView PDF export and email-client compatibility are not covered by the application build.
