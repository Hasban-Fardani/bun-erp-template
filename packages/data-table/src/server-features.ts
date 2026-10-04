import {
  columnFilteringFeature,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
} from "@tanstack/react-table";

/** Manual feature set: state and controls only, with no client row-processing models. */
export const serverTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
