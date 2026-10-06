import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api.ts";

export function createQueryClient(onUnauthorized: () => void) {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!(error instanceof ApiError) || error.status !== 401) return;
        client.clear();
        // The session query renders the signed-out state itself, avoiding a redirect cycle.
        if (query.queryKey[0] !== "session") onUnauthorized();
      },
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
