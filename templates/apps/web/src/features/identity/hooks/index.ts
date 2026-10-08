import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authRequest } from "@web/lib/auth.ts";
import { call, rpc } from "@web/lib/rpc.ts";
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

/** Starts viewing the app as another user. Every cached read belonged to the admin, so all is dropped. */
export function useStartImpersonation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => call(rpc.users[":id"].impersonate.$post({ param: { id } })),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/" });
    },
  });
}

/** Ends the impersonation; the admin's own session was never replaced, so they land back signed in. */
export function useStopImpersonation() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => call(rpc.impersonation.stop.$post()),
    onSuccess: async () => {
      queryClient.clear();
      await navigate({ to: "/" });
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
