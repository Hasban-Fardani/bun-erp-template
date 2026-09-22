import type { LucideIcon } from "lucide-react";

/** Pagination fields every collection endpoint returns alongside `items`. */
export type ListMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type Paged<T> = ListMeta & { items: T[] };

/** Sortable columns the API accepts per resource; the server rejects anything else. */
export const SORT_COLUMNS = {
  users: ["name", "email", "createdAt"],
  roles: ["key", "name", "isSystem"],
  audit: ["createdAt", "event", "actorLabel"],
} as const;

export type EmptyStateConfig = { filtered: boolean; message?: string };

export type TableCopy = {
  addLabel: string;
  addIcon: LucideIcon;
  empty: (search: string) => EmptyStateConfig;
  searchPlaceholder: string;
};
