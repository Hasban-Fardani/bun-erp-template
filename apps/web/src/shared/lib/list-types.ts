/** Pagination fields every collection endpoint returns alongside `items`. */
export type ListMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type Paged<T> = ListMeta & { items: T[] };

/** Empty-state wording differs between "nothing exists" and "nothing matched the filter". */
export type EmptyStateConfig = { filtered: boolean; message?: string };
