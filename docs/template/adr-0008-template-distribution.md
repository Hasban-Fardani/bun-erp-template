# ADR-0008 — Copy or fork the template

**Status:** Accepted distribution model.

Applications copy/fork a clean template. Client names, product data and business rules belong in
those applications, not here. `template.scope.json` owns allowed directories and apps, and
`check:scope` enforces it while `docs/template/` exists. `bun erp project:adopt` deletes both, so a
project is free to carry its own domain vocabulary. A shared multi-client application inside this
template was rejected.
