/** Browser storage keys owned by the web app; keep them together so two features cannot collide. */
export const STORAGE_KEYS = {
  theme: "loom.theme",
  sidebarCollapsed: "loom.sidebar.collapsed",
} as const;
