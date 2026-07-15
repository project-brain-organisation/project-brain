# Task 02 — Schema: `thoughts` + `labels` subtypes

**Read first:** `../backend-redesign-v2.md` §2.2.
**Depends on:** 01. **Blocks:** 03, 04, and most modules.

## Goal
Define the `thoughts` and `labels` subtype tables. As subtypes, their primary key **is** a
foreign key to `entities.id`. They no longer carry `user_id`, `project_id`, or `is_root`
(those moved to `entities` / the `type` discriminator).

## Requirements
Create `apps/api/src/database/schema/thought.schema.ts` — table `thoughts`:
- `id` uuid PK → `entities.id`, `onDelete: 'cascade'`
- `color` varchar(7) null  *(hex inline, e.g. `#aabbcc` — NOT an FK; matches `labels.color`)*
- `body` text NOT NULL default `''`
- `title` varchar(255) NOT NULL default `''`
- `content_hash` varchar(64) null
- `canvas_x`, `canvas_y`, `width`, `height` integer null
- **No `parent_id`** — the feed hierarchy lives in `relationships` (`kind='hierarchy'`, task 03).
- index on `content_hash` if useful for dedup (keep parity with prior `idx_thoughts_content_hash`).

Create `apps/api/src/database/schema/label.schema.ts` — table `labels`:
- `id` uuid PK → `entities.id`, `onDelete: 'cascade'`
- `name` varchar(100) NOT NULL
- `color` varchar(7) NOT NULL default `#999999`
- `is_edge` boolean NOT NULL default false

Add `relations()` tying each subtype's `id` back to `entities` (one-to-one).

## Notes
- Reference the *current* `src/database/schema.ts` (`thoughts`, `labels`) for field parity,
  but drop the columns listed above. Do not copy `user_id`/`project_id`/`parent_id`/`is_root`.
- `colors` table is being dropped (task 04) — color is inline here, never an FK.

## Acceptance criteria
- Both files compile alongside task 01's files.
- Neither table has `user_id`, `project_id`, `parent_id`, or `is_root`.
- `thoughts.color` and `labels.color` are both inline `varchar(7)`.

## Out of scope
- relationships (03), chunks/shared tables (04), barrel/migrations (05).
