# Loading and empty states

States are not decoration and not an afterthought: in an internal tool the same operator sees
them dozens of times a day. Two rules decide everything below.

1. **Never show a bare sentence where the shape is known.** A line of grey text in the middle of
   a card reads as a rendering bug, not as a busy screen.
2. **An empty state must offer the way out.** "No data" without a next action is a dead end; the
   user cannot tell whether the system is broken or simply waiting for them.

## Loading

| Situation | Use | Why |
|---|---|---|
| Rows are being fetched and the columns are known | **Skeleton rows** (`TableSkeleton`) — same padding, same column count | The layout keeps its shape, so nothing jumps when data lands |
| Refetching with rows already on screen | Keep the rows, dim them (`pending` → `opacity-60`) | Replacing visible data with a spinner throws away information the user was reading |
| Whole page before the session is known | **`PageLoading`** — spinner plus a label | There is no layout to skeleton yet |
| A button triggering a write | Spinner **inside** the button, label in present tense (`Memeriksa…`) | The feedback belongs where the user clicked |

Rules that follow from the above:

- A skeleton row must match the real row height. A 24px skeleton over a 44px row is a visible
  jolt at the exact moment the user starts reading.
- Never stack two spinners for one wait (page + table). Pick the outermost one that covers the
  area still unknown.
- Do not use a skeleton for a single row of known width — a 1-row skeleton is slower to read
  than the row itself.

## Empty

The cause decides the message, and the three causes are not interchangeable:

| Cause | Icon | Title | Action offered |
|---|---|---|---|
| No data yet | `Inbox` | Belum ada data | **Primary** — "Tambah …", the same button as the header |
| Filter/search matched nothing | `SearchX` | Tidak ada yang cocok | **Reset** — clear the search or filter |
| Request failed | `TriangleAlert` (danger tone) | Gagal memuat | **Retry** |

Non-negotiables:

- **`no-data` and `no-match` must never share copy.** "Tidak ada data" after a typo in the search
  box sends the user to create a duplicate record.
- An empty state never offers an action the user's role cannot perform. If `user.create` is
  absent, show the explanation and no button.
- Announce failures for assistive tech: the error form uses `role="alert"`; loading uses
  `role="status"` with `aria-live="polite"`.
- Icon is `aria-hidden`; the title carries the meaning. A screen reader must not hear
  "inbox icon, triangle warning".

## What makes a state look slopped

These are the specific patterns to avoid, each of which this repo shipped at least once:

- A centred sentence as the only element — no icon, no title, no action.
- "Memuat…" as page-level copy with no visual indication that anything is happening.
- The same wording for empty-because-filtered and empty-because-new.
- A skeleton whose column count does not match the table it replaces.
- An error rendered as plain grey text, visually identical to a hint.
- Motion added to compensate for a weak state (a bouncing icon where a clear sentence was
  missing). Motion is not a substitute for information.

## Where this lives in code

- `apps/web/src/shared/ui/table-states.tsx` — `TableSkeleton`, `TableEmpty`, `TableNotice`, `PageLoading`
- `apps/web/src/shared/ui/data-table.tsx` — `TableState` picks between them from 4 inputs:
  `pending`, `error`, `filtered`, and whether rows exist
- `apps/web/src/features/admin/resource-table.tsx` — passes `empty.action` so every list gets a
  way out for free

`bun erp check` does not enforce these rules mechanically. They are enforced in review, and by
the fact that the shared components make the correct version the easy one.
