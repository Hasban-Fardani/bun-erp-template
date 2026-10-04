import { isApiPath } from "./routing.ts";

type FetchHandler = (request: Request) => Response | Promise<Response>;

/** Route the API namespace to Hono and all other paths to the optional web app. */
export function createHostFetch(api: FetchHandler, web?: FetchHandler): FetchHandler {
  return (request) => {
    if (isApiPath(new URL(request.url).pathname) || !web) return api(request);
    return web(request);
  };
}
