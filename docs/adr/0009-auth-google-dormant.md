# ADR-0009 — Email/password; dormant Google

**Status:** Accepted; email/password and conditional provider implemented.

Google provider is registered only when both credentials are populated. No Google UI button
is supplied. Current schema defaults each credential to empty; it does not enforce paired
presence. Do not claim env configuration alone supplies a full OAuth interface.
Google-only and mixed SSO paths in one template login were rejected.
