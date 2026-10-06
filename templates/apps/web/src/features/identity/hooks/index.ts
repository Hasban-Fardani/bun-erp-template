import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authRequest } from "../../../lib/auth.ts";
import { sessionQuery } from "../api/queries.ts";

export function useSession() {
  return useQuery(sessionQuery);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => authRequest("sign-in/email", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
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
