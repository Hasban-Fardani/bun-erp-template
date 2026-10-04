import * as z from "zod";

/** The table URL is untrusted; narrow sort and direction before constructing an RPC request. */
export function listParams<S extends string>(query: string, sort: z.ZodType<S>) {
  const params = new URLSearchParams(query);
  return {
    page: params.get("page") ?? "1",
    perPage: params.get("perPage") ?? "25",
    sort: sort.parse(params.get("sort") ?? undefined),
    dir: z
      .enum(["asc", "desc"])
      .default("asc")
      .parse(params.get("dir") ?? undefined),
    ...(params.has("search") ? { search: params.get("search") ?? "" } : {}),
  };
}
