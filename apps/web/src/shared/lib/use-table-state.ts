import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SortDirection = "asc" | "desc";

export type TableState = {
  page: number;
  perPage: number;
  sort: string;
  dir: SortDirection;
  search: string;
};

export type TableStateConfig = {
  /** Column the API sorts by when nothing is chosen; must match the endpoint's allowlist. */
  defaultSort: string;
  defaultDir?: SortDirection;
  defaultPerPage?: number;
  /** Debounce for the search box, in ms. Short enough to feel live, long enough to not spam. */
  searchDelay?: number;
};

/**
 * One source of truth for a server-driven table: page, page size, sort and search, mirrored
 * into the URL so a reload or a shared link lands on the same view. Every table uses this,
 * which is why pagination and sorting cannot be "forgotten" on a new page.
 *
 * State lives in React (not the router) so a keystroke does not push a history entry per
 * character; the URL is written with `replaceState` from an effect instead.
 */
export function useTableState(config: TableStateConfig) {
  const { defaultSort, defaultDir = "asc", defaultPerPage = 25, searchDelay = 300 } = config;

  const [state, setState] = useState<TableState>(() => ({
    ...readFromUrl({ defaultSort, defaultDir, defaultPerPage }),
    search: "",
  }));
  const [searchDraft, setSearchDraft] = useState("");

  /** `false` on the very first render so the initial URL is not rewritten needlessly. */
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    writeUrl(state, { defaultSort, defaultDir, defaultPerPage });
  }, [state, defaultSort, defaultDir, defaultPerPage]);

  // A new sort or a new search invalidates the current page number; keeping page 4 while the
  // result set shrinks is how tables end up showing "no rows" on a non-empty collection.
  const setSort = useCallback((column: string) => {
    setState((prev) => ({
      ...prev,
      sort: column,
      dir: prev.sort === column && prev.dir === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }, []);

  const setPage = useCallback((page: number) => setState((prev) => ({ ...prev, page })), []);
  const setPerPage = useCallback((perPage: number) => setState((prev) => ({ ...prev, perPage, page: 1 })), []);

  // Debounced so a keystroke does not fire a request per character. The timer is per-hook:
  // a module-level timer would be shared by every table on the page.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSearch = useCallback(
    (value: string) => {
      setSearchDraft(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        setState((prev) => ({ ...prev, search: value, page: 1 }));
      }, searchDelay);
    },
    [searchDelay],
  );
  useEffect(() => () => (searchTimer.current ? clearTimeout(searchTimer.current) : undefined), []);

  /** Query string for the endpoint, built once so no page hand-rolls `URLSearchParams`. */
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(state.page),
      perPage: String(state.perPage),
      sort: state.sort,
      dir: state.dir,
    });
    if (state.search) params.set("search", state.search);
    return params.toString();
  }, [state]);

  return { ...state, searchDraft, setSort, setPage, setPerPage, setSearch, queryString };
}

/** Only non-default values reach the URL, so the common view stays a clean address. */
function writeUrl(
  next: TableState,
  defaults: { defaultSort: string; defaultDir: SortDirection; defaultPerPage: number },
) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (next.page !== 1) params.set("page", String(next.page));
  if (next.perPage !== defaults.defaultPerPage) params.set("perPage", String(next.perPage));
  if (next.sort !== defaults.defaultSort) params.set("sort", next.sort);
  if (next.dir !== defaults.defaultDir) params.set("dir", next.dir);
  if (next.search) params.set("q", next.search);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function readFromUrl(fallback: { defaultSort: string; defaultDir: SortDirection; defaultPerPage: number }) {
  if (typeof window === "undefined") {
    return { page: 1, perPage: fallback.defaultPerPage, sort: fallback.defaultSort, dir: fallback.defaultDir };
  }
  const params = new URLSearchParams(window.location.search);
  const page = Number(params.get("page"));
  const perPage = Number(params.get("perPage"));
  const dir = params.get("dir");
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    perPage: Number.isInteger(perPage) && perPage > 0 ? perPage : fallback.defaultPerPage,
    sort: params.get("sort") ?? fallback.defaultSort,
    dir: dir === "asc" || dir === "desc" ? dir : fallback.defaultDir,
  };
}
