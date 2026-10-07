import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { identityKeys } from "../features/identity/api/keys.ts";
import { ApiError } from "./api.ts";

/**
 * `onMutationError` is the app-wide handler for failed mutations; `main.tsx` wires it to the toast
 * bridge so a failed write always surfaces feedback.
 */
export function createQueryClient(onUnauthorized: () => void, onMutationError?: (error: unknown) => void) {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!(error instanceof ApiError) || error.status !== 401) return;
        client.clear();
        // The session query renders the signed-out state itself, avoiding a redirect cycle.
        if (query.queryKey[0] !== identityKeys.session[0]) onUnauthorized();
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => onMutationError?.(error),
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
      },
    },
  });
  return client;
}
