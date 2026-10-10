# Shared email templates

Vendored MIT React Email compositions from [emailcn](https://www.emailcn.run/). Exact upstream commit/file provenance is in component-sources.json; LICENSE.upstream retains the original license.

Import content sections from `@loom/email-templates/molecules/*` and `@loom/email-templates/organisms/*` to compose within one Html/Body document. The templates contain complete upstream email documents; do not nest complete document templates inside each other. Exported sections accept upstream typed props. Supply actual content, images and destinations from the product. `ActionLink` renders a non-clickable styled element when no `href` is supplied; navigation and social-link collections are empty by default. External demo image fallback assets were removed.

Call `renderEmailDocument` from `@loom/email-templates/render` on demand. Its dynamic renderer import keeps rendering dependencies out of the initial application bundle. No provider, delivery credentials or email transport is included.

Email sections use table-based email layouts, independent from interactive TanStack UI forms/tables. Rendered markup must be checked in the target email clients before release.
