import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "../../lib/api.ts";

export type SystemStatus = {
  /** The API answered at all. If false, the other field is meaningless. */
  api: boolean;
  /** `/ready` reports the database responding, not just the process being alive. */
  database: boolean;
};

/**
 * Reads the public readiness endpoint. Unauthenticated by design: whoever is about to sign in
 * deserves to know whether signing in can work, and finding out by failing costs them a
 * password round trip.
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: async (): Promise<SystemStatus> => {
      try {
        const res = await fetch(apiUrl("/api/v1/ready"));
        if (!res.ok) return { api: true, database: false };
        const body = (await res.json()) as { status?: string; checks?: { database?: { ok?: boolean } } };
        return { api: true, database: body.checks?.database?.ok === true || body.status === "ready" };
      } catch {
        // An unreachable API is a state to display, not an error to throw: the login screen's
        // job is to tell the person, not to fail.
        return { api: false, database: false };
      }
    },
    refetchInterval: 30_000,
    retry: false,
  });
}
