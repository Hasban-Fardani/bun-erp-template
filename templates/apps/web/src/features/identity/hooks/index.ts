import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authRequest } from "@web/lib/auth.ts";
import { identityKeys } from "../api/keys.ts";
import { sessionQuery } from "../api/queries.ts";

export function useSession() {
  return useQuery(sessionQuery);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => authRequest("sign-in/email", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identityKeys.session }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => authRequest("sign-out"),
    onSuccess: () => {
      queryClient.clear();
      void navigate({ to: "/login" });
    },
  });
}

/** Asks the server to mail a reset link. The server answers the same way for unknown addresses. */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: { email: string; redirectTo: string }) => authRequest("request-password-reset", input),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: { token: string; newPassword: string }) => authRequest("reset-password", input),
  });
}
