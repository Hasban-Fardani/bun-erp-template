import { type ColumnDef, createColumnHelper as createTanStackColumnHelper, type RowData } from "@tanstack/react-table";
import type { localTableFeatures } from "./features";

/** A local-table column definition with feature-aware cell and filter types. */
export type Column<TData extends RowData> = ColumnDef<typeof localTableFeatures, TData>;

/** Create a type-safe helper for accessor, display, and grouped columns. */
export function createColumnHelper<TData extends RowData>() {
  return createTanStackColumnHelper<typeof localTableFeatures, TData>();
}

/** Short factory for column definitions: `const column = Column<User>()`. */
export const Column = createColumnHelper;
