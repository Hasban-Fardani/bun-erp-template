# Conventions

- Bun only; exact package versions. Do not add dependencies for available Web/Bun APIs.
- Strict TypeScript, meaningful types; no `as any` to bypass a contract.
- Comments use English and explain why. User-facing copy follows [UI copy](ui-copy.md).
- Share identical logic; do not suppress a gate before checking its finding.
- Input schemas compile once at module scope. HTTP validation uses middleware after authorization.
- A service owns its transaction and transactional audit; route code stays thin.
- New ADRs use the next available number; old proposals do not reserve or overwrite decisions.
- Forward-only `NNNN_snake_case.sql` migrations; never reset an applied ledger.
- Logger redaction and audit field allowlists are separate safeguards; never log secrets.
- Node built-ins are restricted by `tools/platform.ts`; exceptions are explicit per path.

`bun erp check` verifies lint, types and the registered gates in parallel.
It does not mechanically enforce every sentence here. Run the appropriate tests as well.
Use [testing](testing.md) for fixtures and [architecture](architecture.md) for boundaries.
