# Documentation, concurrent checks and mobile — verification

Recorded on 2026-10-04 for this working tree; not a future guarantee.

- 65 existing Markdown files reviewed; old content reduced about 83%. New mobile guides are separate.
- Active guidance is indexed in [docs](../README.md); ADR implementation state is explicit.
- Historical measurements/evidence remain separate; original long reports are in Git `f3271b2`.
- `bun erp.ts check`: 18 checks passed, sampled wall time 13.59s → 10.97s (~19% faster).
  Biome, TypeScript and 16 gates now overlap. This is one measured run per version, not a benchmark median.
- `bun erp test`: 83 backend + 4 web passed. Failure aggregation also covers an unavailable executable.
- `bun erp build` and `bun erp mobile:build`: exit 0. Capacitor CLI/config on Bun: exit 0.
- Mobile asset browser preview: 390px, login form visible, no horizontal overflow or JS errors.
- Native identity missing: expected exit 1 before native projects are created.
- CI mobile-build job configured and actionlint passed; GitHub execution NOT_RUN.
- Native authentication NOT_IMPLEMENTED; iOS/Android compilation/device/signing/store release NOT_RUN.

Evidence:
[check before](docs-refresh-check-before.txt), [check after](docs-refresh-check-final.txt),
[tests](docs-refresh-test-final.txt), [web build](docs-refresh-web-build.txt),
[mobile build](docs-refresh-mobile-build.txt), [mobile browser](docs-refresh-mobile-browser.txt),
[CLI/config](docs-refresh-capacitor-config.txt), [identity RED](docs-refresh-mobile-identity-red.txt),
[link RED/GREEN](docs-refresh-link-red.txt), [size inventory](docs-refresh-sizes.txt),
[frozen install](docs-refresh-install-frozen.txt), [workflow lint](docs-refresh-actionlint.txt).

Existing gate rules/assertions were retained. template.scope.json now allows apps/mobile as
requested. New docs-link validation checks owned docs and skips installed dependencies/build output.
All task statuses remain in_progress; secrets and generated mobile output are ignored.
