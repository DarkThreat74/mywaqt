# Goals Section — Implementation Plan

## Overview

A new top-level Goals section where users can create a list of goals, check them off,
view them as a tree/mindmap with branches and sub-goals, and share them as an image,
PDF, or public link.

---

## 1. Navigation

Add Goals as a **4th nav item** in the bottom nav and desktop sidebar:

```
Calendar | Prayer | Goals | Settings
```

- Icon: `Target` from lucide-react
- Route: `/goals`
- The mobile bottom nav currently has 3 items; adding a 4th is fine — each item
  gets ~25% width on a 320px screen = 80px per item, plenty for icon + label.

---

## 2. Database Schema

### Table: `goals`

```sql
CREATE TABLE goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES goals(id) ON DELETE CASCADE,  -- null = root goal
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',  -- active | done | archived
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT,                              -- hex color for the node
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ                        -- null = not done
);
```

### Table: `goal_share_tokens`

```sql
CREATE TABLE goal_share_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Drizzle schema additions (`src/lib/db/schema.ts`)

```ts
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references(() => goals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('active').notNull(),  // active | done | archived
  sortOrder: integer('sort_order').default(0).notNull(),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const goalShareTokens = pgTable('goal_share_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Migration: `drizzle/0000-0029_combined.sql` (was 0005_goals)

---

## 3. API Routes

### `GET /api/goals`
- Returns all goals for the authenticated user (flat array, client builds the tree)
- Response: `[{ id, parentId, title, description, status, sortOrder, color, completedAt }]`

### `POST /api/goals`
- Create a new goal
- Body: `{ title, parentId?, description?, color? }`
- Returns the created goal

### `PATCH /api/goals`
- Update a goal (title, description, status, color, parentId, sortOrder)
- Body: `{ id, ...fieldsToUpdate }`
- Returns the updated goal

### `DELETE /api/goals?id=<uuid>`
- Delete a goal and all its descendants (cascade delete in DB)
- Returns `{ success: true }`

### `POST /api/goals/share`
- Generate or get existing share token
- Returns `{ token, url }`

### `DELETE /api/goals/share`
- Revoke share token
- Returns `{ success: true }`

### `GET /api/goals/shared?token=<token>`
- Public endpoint — returns goals for the shared token (read-only, no auth)
- Returns same shape as `GET /api/goals` but without auth

---

## 4. Pages & Components

### `/goals` — Main goals page (client component)

**Layout:**
- Header with title "Goals" and a view toggle (List ↔ Tree)
- Share button (opens share menu)

**List View:**
- Flat list of root goals, each with:
  - Checkmark button (toggles done/active)
  - Title (click to edit)
  - Expand/collapse children indicator
  - Add sub-goal button (+)
  - Delete button (×)
  - Drag handle for reordering (optional, later)
- Children are indented under parents, recursively
- Each row: `[✓] [Title]  [+] [×]`
- Done goals show strikethrough + checkmark filled
- Color dot next to title (if custom color set)

**Tree View:**
- Horizontal tree diagram (left to right)
- Root goals on the left, branches expand to the right
- Each node: colored circle + title + status
- Click a node to expand/collapse children
- Checkmark on done nodes
- Pan/zoom support (optional — start with simple scroll)
- Use SVG lines to connect parent → child nodes
- Library: No external dependency — build with absolute-positioned divs + SVG
  connector lines. Keeps the bundle small and avoids dependency bloat.

**Share Menu (modal):**
- "Export as Image" button → renders the current view to PNG
- "Export as PDF" button → renders to PDF
- "Copy public link" button → copies shareable URL
- "Revoke link" button (if link exists)

### `/goals/shared/[token]` — Public shared goals page

- Read-only view of the shared goals
- Same list/tree toggle
- No edit buttons
- "Add to my goals" CTA (if logged in, links to /goals)

---

## 5. Export Implementation

### Image export (PNG)
- Use `html-to-image` library (`npm add html-to-image`)
- Capture the goals container DOM node → PNG → download or share
- On native: use `shareNative()` to share the image file
- On web: trigger download

### PDF export
- Use `jspdf` library (`npm add jspdf`)
- Render the goals tree to a canvas → add to PDF → save
- Or: use `html-to-image` to get PNG, then embed in jsPDF
- A4 landscape for tree view, A4 portrait for list view

### Public link
- Generate a UUID token, store in `goal_share_tokens`
- URL format: `/goals/shared/<token>`
- Read-only public page, no auth required
- User can revoke at any time

---

## 6. File Structure

```
src/
├── app/
│   ├── (app)/goals/
│   │   ├── page.tsx              # Server component — fetches goals, renders client
│   │   └── GoalsClient.tsx       # Main client component (list + tree views)
│   ├── goals/shared/[token]/
│   │   ├── page.tsx              # Public shared goals page
│   │   └── SharedGoalsClient.tsx # Read-only client component
│   └── api/goals/
│       ├── route.ts              # GET (list) + POST (create) + PATCH (update)
│       ├── [id]/route.ts         # DELETE (single goal)
│       ├── share/route.ts        # POST (generate token) + DELETE (revoke)
│       └── shared/route.ts       # GET (public, by token)
├── components/
│   ├── goal-tree.tsx             # Tree view component (SVG connectors)
│   ├── goal-list.tsx             # List view component (recursive rows)
│   ├── goal-node.tsx             # Single goal node (shared between views)
│   └── goal-share-menu.tsx       # Share modal (image/PDF/link)
└── lib/
    └── goals/
        └── tree.ts               # Tree building helpers (flat → tree, flatten)
```

---

## 7. Mobile Considerations

- List view: full width, indentation via `pl-4` per level (max 4 levels to avoid
  overflow on 320px)
- Tree view: horizontal scroll on mobile (`overflow-x-auto`), pinch-zoom optional
- Share menu: bottom sheet on mobile (`items-end`), centered on desktop
- Checkmark button: 44px tap target (min-h-[44px] min-w-[44px])
- No fixed widths — everything responsive
- Tree nodes: `min-w-[120px]` so text doesn't clip

---

## 8. Dependencies to Add

- `html-to-image` — for PNG export (small, ~15KB gzipped)
- `jspdf` — for PDF export (~150KB gzipped, lazy-loaded only when exporting)

Both are lazy-imported only when the user taps export, so they don't affect
initial page load.

---

## 9. Build Order

1. Add schema + migration
2. Add API routes (CRUD + share)
3. Build `GoalsClient.tsx` with list view only
4. Add tree view
5. Add share menu with public link
6. Add image export
7. Add PDF export
8. Add public shared page
9. Wire into navigation
10. Typecheck + lint + build + commit
