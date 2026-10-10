import type { DataTableLabels } from "@loom/data-table/server-table";
import { useI18n } from "@loom/i18n/react";

export function useResourceTableLabels(): DataTableLabels {
  const { t, formatNumber } = useI18n();
  return {
    loading: t("table.loading"),
    refreshing: t("table.refreshing"),
    staleData: t("table.staleData"),
    actions: t("table.actions"),
    retry: t("table.retry"),
    clearSearch: t("table.clearSearch"),
    empty: {
      "no-data": {
        title: t("table.empty.noData.title"),
        detail: t("table.empty.noData.detail"),
      },
      "no-match": {
        title: t("table.empty.noMatch.title"),
        detail: t("table.empty.noMatch.detail"),
      },
      error: {
        title: t("table.empty.error.title"),
        detail: t("table.empty.error.detail"),
      },
    },
    pagination: {
      range: (first, last, total) =>
        t("table.pagination.range", {
          first: formatNumber(first),
          last: formatNumber(last),
          total: formatNumber(total),
        }),
      rowsPerPage: t("table.pagination.rowsPerPage"),
      perPage: t("table.pagination.perPage"),
      first: t("table.pagination.first"),
      previous: t("table.pagination.previous"),
      next: t("table.pagination.next"),
      last: t("table.pagination.last"),
      pageStatus: (page, totalPages) =>
        t("table.pagination.pageStatus", { page: formatNumber(page), totalPages: formatNumber(totalPages) }),
    },
  };
}
