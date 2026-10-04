# UI states

Source: `packages/ui/src/molecules/table-states.tsx`, `packages/ui/src/organisms/data-table.tsx` and
`features/admin/resource-table.tsx` in apps/web. Use existing components.

| State | Feedback |
|---|---|
| First row fetch | Skeleton matching real columns/row dimensions |
| Refetch with data | Keep visible rows and mark pending |
| Session unknown | PageLoading, one loading indicator |
| Mutation | Disable repeat submission; progress at the action |
| No rows yet | Creation action only if permission allows |
| No filter match | Clear/reset filters |
| Request failure | Notice with retry and recoverable explanation |

Status uses aria-live; failure notices use role=alert. Decorative icons are hidden from
assistive technology. Mutation notifications use the shared toast system.
Preserve keyboard focus and usable touch targets; test narrow widths, long content and theme.
These are requirements for changes, not a claim every existing screen satisfies them.
