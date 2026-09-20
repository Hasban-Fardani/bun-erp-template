import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ApiError, api, apiUrl } from "../../lib/api.ts";
import type { PublicUser, SessionView } from "./types.ts";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async (): Promise<SessionView> => {
      // Respons Better Auth TIDAK lewat envelope {data,meta} milik API — baca mentah.
      const res = await fetch(apiUrl("/api/v1/auth/get-session"), { credentials: "include" });
      if (!res.ok) throw new Error(`Gagal memeriksa sesi (HTTP ${res.status})`);
      const auth = (await res.json()) as { user?: { id: string; name: string; email: string } | null } | null;
      if (!auth?.user) return { authenticated: false, user: null, permissions: [] };
      // 403 di /me = identitas sah tanpa izin (bukan sesi mati) — jangan dilempar sebagai error.
      const me = await api
        .get<{ userId: string; organizationId: string | null; permissions: string[] }>("/api/v1/me")
        .catch((err) => (err instanceof ApiError && err.status === 403 ? null : Promise.reject(err)));
      return { authenticated: true, user: auth.user, permissions: me?.permissions ?? [] };
    },
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const res = await fetch(apiUrl("/api/v1/auth/sign-in/email"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Login gagal");
      return body;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useUsers(search: string) {
  return useQuery({
    queryKey: ["users", search],
    queryFn: () =>
      api.get<{ items: PublicUser[]; total: number }>(
        `/api/v1/users?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; password: string; roleKey?: string }) =>
      api.post<PublicUser>("/api/v1/users", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ id: string }>(`/api/v1/users/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

/** Katalog role untuk pilihan form; organisasi tanpa izin role.read jatuh ke role sistem bawaan. */
export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<{ items: { key: string; name: string }[] }>("/api/v1/roles"),
    select: (d) => d.items,
    retry: false,
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      await fetch(apiUrl("/api/v1/auth/sign-out"), { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      qc.clear();
      void navigate({ to: "/login" });
    },
  });
}
