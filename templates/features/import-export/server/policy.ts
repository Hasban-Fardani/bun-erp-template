import type { PermissionKey } from "../rbac/statements.ts";

/** Maps module actions to permissions. Routes read from here — permissions are never hardcoded. */
export const ACTION_PERMISSION = {
  list: "import-export.read",
  read: "import-export.read",
  dryRun: "import-export.create",
  import: "import-export.create",
  cancel: "import-export.update",
  resume: "import-export.update",
  export: "import-export.read",
} as const satisfies Record<string, PermissionKey>;
