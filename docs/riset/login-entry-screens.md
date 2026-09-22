# Entry screens: what the measured evidence says

Research for the login page. Sixteen real products measured in a browser (computed styles via
Chromium), plus two written sources. Numbers are measurements, not impressions.

## The measurement

| Product | Form width | Input height | Input font | Radius | Layout |
|---|---|---|---|---|---|
| Stripe | 412 | 44 | 16 | 6 | centred |
| Figma | 422 | 53 | 18 | 6–8 | centred |
| Slack | 400 | 44 | 18 | 12 | centred |
| Vercel | 320 | 40 | 16 | 8 | centred |
| Resend | 248 (input 512) | 48 | 16 | 16 | left-weighted |
| Dub | 376 | 38 | 14 | 6 | **panel right, 595px, has media** |
| Clerk | 322 | — | 14 | — | centred |
| Notion | 360 | 26 | 15 | 0 | centred |

This repo's login before the change: form 416, input 32, font 13, radius 6, centred.

## What this changes

1. **Centred single card is not the problem.** Eight of eight measured pages are single-column.
   A centred card is the invariant of entry screens, not a sign of laziness. Any claim that it
   is "boring" has to point at something else.
2. **The problem is density.** Every measured page sits at 16–18px input text and 40–53px input
   height. This repo was at 13px/32px — a table's density applied to a form. That is the actual
   defect, and it is measurable.
3. **Presence is low.** Resend 248px, Clerk 322, Vercel 320, Notion 360. Only Stripe (412) and
   Figma (422) go wider. Our 416 was already at the wide end.
4. **A second panel does appear — but for a reason.** Dub is the only measured page with a side
   panel (595px, contains media). It carries the product, not decoration. When a panel holds no
   argument, it is a stock-photo slab and the evidence does not support it.

## Written sources

- **web.dev, Sign-in form best practices** (Sam Dutton). Checklist that matters for a template:
  stable `name`/`id` values across deployments; label every input; never disable paste in a
  password field; `autocomplete="username"` and `current-password` so password managers work;
  inputs and buttons large enough for thumbs; keep the sign-in button visible when the mobile
  keyboard is open; include the product's own name and mark so the page is not a stranger.
- **Authgear, Login & Signup UX guide.** Recoverable states: never leave the user in an error
  with no exit; offer a reset or sign-up path; keep the entered email after a failed attempt so
  only the password is retyped; support a "remember me" style long session where the domain
  allows it.
- **eleken, 50 login examples.** Calls out split-screen as common, but the useful note is that
  it works when the second side *positions the product* (their Frontend AI example: an
  illustration of the AI-for-developers promise). Where it is generic art, it is filler.

## What this repo will do

- Keep the centred card. The evidence does not support a split panel for this product.
- Raise form density to the measured band: 44px inputs, 16px text.
- Add a **system status strip** instead of a decorative panel. This is the authored device: a
  template cannot claim client logos or uptime numbers without fabricating them, but it can show
  the truth it already knows — whether the API and database are answering. It earns its place
  (an internal tool benefits from knowing the backend is up before typing a password) and it
  fabricates nothing.

## What is explicitly rejected

- Split panel with stock illustration: no argument, and the template has no brand media.
- Testimonial or logo wall: would require inventing customers. Banned by the scope gate anyway.
- Uptime or user-count metrics: cannot be derived from anything real.

## Not verified

- Conversion claims in the marketing sources are not reproducible here; they are cited as
  editorial opinion, not evidence.
- Figma and Slack input heights (53px, 44px) include their container padding; the visible field
  may be smaller.
