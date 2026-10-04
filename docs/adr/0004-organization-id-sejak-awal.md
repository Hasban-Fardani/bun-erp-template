# ADR-0004 — Organization from the beginning

**Status:** Accepted; implemented in module schemas.

Single-tenant is the template default; business tables include organization_id from their
first migration. Server context supplies it, never a client's body/query. Retrofitting it after
production data was rejected because it adds backfill and migration risk.
