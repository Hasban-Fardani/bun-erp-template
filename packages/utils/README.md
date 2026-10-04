# Shared utilities

Add a utility here only when at least two applications or workspace packages need the same
platform-neutral behavior. Keep this package free of React, Hono, filesystem, DOM, Capacitor,
database and application-feature imports. App-specific adapters and UI helpers stay with their
own package. Each utility needs focused tests and a real second consumer before it is promoted.
