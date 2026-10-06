# UI states

Source: `packages/ui/src/molecules/table-states.tsx` and, once installed,
`packages/data-table/src/server-table.tsx` / `packages/data-table/src/resource-table.tsx` from the
`data-table` catalog package. Use existing components.

| State | Feedback |
|---|---|
| First row fetch | Skeleton matching real columns/row dimensions |
| Refetch with data | Keep visible rows and show a visible pending indicator (`role="status"`, `data-testid="table-refreshing"`); never blank the table |
| Session unknown | PageLoading, one loading indicator |
| Mutation | Disable repeat submission; progress at the action |
| No rows yet | Creation action only if permission allows |
| No filter match | Clear-search affordance that resets the query in one action |
| Request failure | Notice with a retry action and recoverable explanation |

Status uses aria-live; failure notices use role=alert. Decorative icons are hidden from
assistive technology. Mutation notifications use the shared toast system.
Preserve keyboard focus and usable touch targets; test narrow widths, long content and theme.

Motion and reduced motion:

- Authored keyframes live in `packages/ui/src/styles.css`; screens do not carry inline keyframes or
  magic durations.
- A global `@media (prefers-reduced-motion: reduce)` block disables every animation used by a
  `[data-slot]` surface and the named entrance classes.
- Looping utilities (`animate-spin|ping|pulse|bounce`) use `motion-safe:` or pair with
  `motion-reduce:animate-none`; `bun erp check:gate motion` enforces both.
- Overlays animate on open and close rather than appearing abruptly, and the same reduced-motion
  guard covers them.

`bun erp check:gate ui` enforces the list feedback (`TABLE_FEEDBACK_MISSING`): the shared table
declares refetch, clear-search and retry, and every feature screen mounts them. These are
requirements for changes, not a claim every existing screen satisfies them.
