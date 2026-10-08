# Domain docs

Project-owned. Single-context layout for `grill-with-docs`, `domain-modeling`, `to-spec`,
`to-tickets` and `code-review`.

- Glossary: `GLOSSARY.md` at the repository root. Use its terms in specs, tickets, tests and code;
  add a term the moment it crystallises.
- Decisions: `docs/adr/NNNN-<slug>.md`, indexed in `docs/adr/README.md`. Record only choices that
  are hard to reverse, surprising, and the result of a real trade-off. Add a row to the index.
- Architecture and conventions that already exist stay in `docs/architecture.md` and
  `docs/conventions.md`; read them before proposing structure, and do not restate them in ADRs.
