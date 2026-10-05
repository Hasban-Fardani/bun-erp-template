# QA Project Context

## Product

This repository is a reusable starter for internal business applications. It is not a finished
ERP and must not assume a client's business rules or production data. The current example surface
is an admin console for authentication, users, roles, audit records, and platform health.

## Technology and test stack

- Monorepo, Bun 1.4.2, TypeScript, Hono, Drizzle, PostgreSQL-compatible schema.
- Local development runs Vite with HMR and a Bun/Hono API; the local database is persistent
  PGlite at `.data/development`.
- Web UI uses React, Vite, TanStack Router, and TanStack Query.
- Backend and package tests use `bun:test`; browser QA uses `playwright-core` through `bun run qa`.
- Mobile uses React and Capacitor. Browser QA does not replace native iOS/Android validation.
- CI definitions live in `.github/workflows/`; app deployment targets are Bun and Cloudflare Workers.

## Environments and data

- Local URL defaults to `http://localhost:5173`; `/api/*` is proxied to the API listener.
- Use an isolated local development database and disposable QA accounts only.
- The local development server seeds the default organization and system RBAC records. It does not
  create an owner user; `bun erp user:create` creates that account for the configured database.
- Browser QA credentials come from `QA_EMAIL` and `QA_PASSWORD`. Never write credentials, cookies,
  tokens, or personal data into test reports or screenshots.
- The Playwright runner writes machine output under ignored `.data/qa/`.

## Critical journeys and risk areas

1. Sign in, authenticated route access, and sign out: high risk because failures block the admin.
2. User list search, sorting, paging, and role assignment: high risk because malformed RPC queries
   or permissions can hide or misassign access.
3. Roles and audit search: medium-to-high risk because they affect access review and traceability.
4. Login and admin-list layouts at 320–767 CSS pixels: medium risk because clipping, uneven
   controls, misaligned card metadata, or undersized touch targets can block mobile use.
5. API and UI errors: high risk when requests fail silently or return an unexpected envelope.

## QA rules

- Use Playwright for browser automation. Do not add or run Cypress.
- `bun run qa` checks the users screen at 320, 360, 390, 430, 767, 768, 1024, and 1440 CSS
  pixels for overflow, alignment, and mobile touch-target size.
- Prefer accessible role/name locators and existing `data-testid` selectors over brittle CSS paths.
- Record exact reproduction steps, expected and actual behavior, severity, and evidence for each bug.
- Run tests only against local or explicitly approved non-production environments.
- Distinguish `NOT_RUN`, `BLOCKED`, and verified results. A passing unit suite is not browser QA.
- Keep QA notes factual; do not infer that untested Cloudflare or native mobile paths passed.
