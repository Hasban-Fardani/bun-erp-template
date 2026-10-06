export type SessionView = {
  authenticated: boolean;
  user: { id: string; name: string; email: string } | null;
  permissions: readonly string[];
};
