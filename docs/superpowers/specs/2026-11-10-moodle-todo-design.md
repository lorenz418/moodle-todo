# Moodle Todo: Design

Date: 2026-11-10
Status: Approved in brainstorming, pending written review

## Goal

A Chrome extension that turns TUM Moodle course pages (`https://www.moodle.tum.de`) into a todo list. The user works through lecture material and problem sheets on their own and wants to check off items directly in Moodle instead of copying them into a separate todo app.

TUM Moodle has activity completion disabled in all observed courses (no completion markup in any example page), so the extension provides its own checkboxes and stores state itself.

## Scope

### v1 (this spec)

- A checkbox on every course item (except text labels), directly on the course page.
- Ignore rules with three layers (item, course + type, global + type) and sensible defaults.
- Progress badges per section/tab and a progress bar per course page.
- An options page to review and reset ignore rules.

### Explicitly not in v1

- Checkboxes on activity detail pages (`mod/*/view.php`).
- Dashboard (`/my/`) integration and a toolbar popup.
- Background fetching of course pages.
- Cleanup of old semesters' data.
- Other Moodle instances than `www.moodle.tum.de`.

## Observed Moodle structure (from `examples/`)

Saved pages from 7 courses, 12 files. Three course formats appear:

| Format | Courses | Behavior |
|---|---|---|
| `format-onetopic` (tabs) | Engineering Thermodynamics, Numerische Methoden | One section per page. Tabs in `ul.format_onetopic-tabs`, each tab `a.nav-link` links to `course/view.php?id=<course>&section=<n>`. Active tab has `a.nav-link.active`. |
| `format-topics` | Modeling and Simulation with ODEs, Methods of Product Development | All sections on one page. |
| `format-weeks` | Material Science I, Nanotechnologie | All sections on one page, one per week. |

Common markup in all formats:

- Course ID: `body` class `course-<id>`.
- Course name: the course page heading `h1` (plain course name). Not the `<title>`, which carries language-dependent prefixes such as "Kurs:", "Course:", "Abschnitt: <section> | ...".
- Format: `body` class `format-<name>`.
- Section: `li.section[data-for="section"]` with `data-sectionid="<n>"` (section number) and `data-sectionname` (when present; otherwise take the section title text).
- Item: `li.activity[data-for="cmitem"]` with `data-id="<cmid>"` and class `modtype_<type>`. Name in `div.activity-item[data-activityname]` (fallback: `.instancename` text).
- Section headings in topics/weeks courses link to `course/section.php?id=<sectionDbId>`, Moodle's single-section view. No example of that page was saved; it is assumed to use the same section/item markup and is verified manually.
- Item types seen: `resource`, `lti` (TUM-Live recordings), `url`, `folder`, `assign`, `forum`, `choice`, `label`.

The course module ID (`cmid`) is stable across renames and moves, so all state is keyed by it.

## User experience

### Items

- Checkbox to the left of each item's icon.
- Checked: the row fades (reduced opacity, title struck through).
- On hover, a small menu button appears at the right of the row. The menu offers:
  - Ignore this item (or "Track this item" if currently ignored)
  - Ignore all *<Type>* in this course (or "Track all ...")
  - Ignore all *<Type>* everywhere (or "Track all ...")
- Menu labels: each entry shows the action that would change the rule in effect at its layer. The item entry looks at the item's resolved state, the course entry at the course rule for the type (falling back to the global rule, then the default), and the global entry at the global rule (falling back to the default). Example: forums ignored globally, one forum item tracked by override: the menu offers "Ignore this item", "Track all Forum in this course", "Track all Forum everywhere".
- Ignored items: no checkbox, faded further, excluded from all counts. The hover menu still works so they can be restored.
- Text labels (`modtype_label`) get no UI at all.

Display names for types: `resource` File, `lti` Recording, `url` Link, `folder` Folder, `assign` Assignment, `forum` Forum, `choice` Survey, `quiz` Quiz, `page` Page. Unknown types display their raw `modtype` name.

### Progress

- Topics/weeks courses: a badge next to each section heading, e.g. `3/7`. Turns green with a check mark when the section is complete. Sections with no tracked items show no badge.
- Onetopic courses: the same badge on each tab. Tabs whose section has never been opened show no badge (the extension has not seen their items). Once opened, the badge persists using the seen cache.
- Every course page: a slim progress bar at the top of the course content, "18 / 42 done". On onetopic courses it carries a note that it only counts opened tabs.

## Ignore rules

State for an item is resolved by the most specific rule:

1. Item override for this cmid: `ignore` or `track`.
2. Course type rule for this item's type: `ignore` or `track`.
3. Global type rule for this item's type: `ignore` or `track`.
4. Default: `track`.

If the resolved rule is `ignore`, the item is `ignored`. Otherwise it is `done` if its cmid is in the course's done list, else `open`. An item's done flag is kept while it is ignored, so restoring it brings back its previous checked state.

Initial global rules on first install: `forum: ignore`, `choice: ignore`.

Menu actions change exactly one layer. Setting a layer to a value writes an explicit rule there, so a course can override a global ignore and an item can override a course ignore. Exception to keep rules from piling up: if the new value equals what the layers below would resolve to anyway, the rule at that layer is removed instead of written (for example, un-ignoring an item whose type is tracked deletes the item override). At the global layer, `track` equals the default, so tracking a type globally removes its global rule.

### Options page

- Global section: one toggle per known type (ignore or track). Known types are the types with a display name listed above, plus any other type found in a seen cache or a stored rule.
- Per course (every course that has any stored data, listed by name): its course type rules and the count of item overrides, with a "reset rules" button (clears type rules and item overrides, keeps checkmarks) and a "reset everything" button (also clears checkmarks), each with a confirmation.

## Architecture

WXT (pinned to 0.21.x) with TypeScript, Vitest for tests. Pure logic is separated from DOM and storage.

| Unit | Responsibility |
|---|---|
| `entrypoints/moodle.content.ts` | Content script, matches `https://www.moodle.tum.de/course/view.php*` and `https://www.moodle.tum.de/course/section.php*`. Wires parse, store, model and UI together. |
| `src/parse/page.ts` | `parsePage(document)` returns `{ courseId, courseName, format, activeSection?, sections: [{ num, name, headingEl, items: [{ cmid, type, name, el }] }], tabs?: [{ num, el }] }` or `null` if the page is not a recognizable course page. Labels are excluded from `items`. |
| `src/model/rules.ts` | Pure rule logic. `resolveState(item, courseData, globalData)` returns `"open" | "done" | "ignored"`. `menuState(layer, item, courseData, globalData)` returns the value currently in effect at a layer (drives menu labels). `applyMenuAction(layer, value, item, courseData, globalData)` returns updated data, writing or removing the rule per the removal rule. |
| `src/model/progress.ts` | Computes `{ done, total }` per section number and for the course from the seen cache plus stored data. Pure. |
| `src/storage/store.ts` | Typed access to the storage keys below via WXT storage. Exposes get, update and a change watcher. |
| `src/ui/` | Checkbox, hover menu, section/tab badge, progress bar. Receive state, emit user actions. No storage access. |
| `entrypoints/options/` | Options page as described above. |

### Storage

`chrome.storage.sync` (user decisions, synced across the user's Chrome devices):

- `global`: `{ typeRules: Record<type, "ignore" | "track"> }`
- `course:<courseId>`: `{ name: string, done: number[], itemOverrides: Record<cmid, "ignore" | "track">, typeRules: Record<type, "ignore" | "track"> }`

`chrome.storage.local` (rebuildable cache):

- `seen:<courseId>`: `Record<cmid, { section: number, type: string }>`

The seen cache is local because it can be rebuilt by visiting pages and could grow large. Consequence: on a second device, onetopic tab badges fill in only as tabs are opened there.

Size check: `course:<id>` stores cmids as numbers; roughly 900 checkmarks fit in Chrome's 8 KB per-key sync limit, well above any observed course (largest: 26 items).

### Data flow

1. Course page loads; content script runs `parsePage`. If `null`, stop and log one console warning.
2. Update the seen cache: for every section present on the page, replace all cached entries of that section with the items currently on the page (removes items deleted by the teacher). Sections not present on the page are untouched.
3. Load `global` and `course:<id>`. On `course/view.php` only, write `name` into `course:<id>` if missing or changed (on `section.php` the heading may show the section name).
4. Resolve each item's state and render checkboxes, menus, badges, and the progress bar.
5. User action: update storage, then re-render from the new state.
6. Watch storage changes for `global` and this course's keys, re-render on change (keeps multiple tabs consistent).

Counting: total = seen items whose resolved state is not `ignored`; done = those whose state is `done`. Checkmarks for cmids not in the seen cache are not counted.

### Rendering

- Idempotent: rendering again updates existing injected elements instead of adding new ones (injected elements carry a dedicated class/data attribute).
- Injected styles are scoped under a unique class prefix to avoid clashing with Moodle's CSS.

## Error handling

- Unrecognized page: do nothing, one console warning.
- Storage write fails (e.g. sync quota): revert the optimistic UI change and show a short message in the progress bar.
- Concurrent tabs: changes from other tabs arrive via the storage watcher. Each write re-reads the current key value right before modifying it (never writes a cached snapshot), so in practice tabs do not overwrite each other. Two clicks in different tabs within milliseconds could still lose one update; that is accepted.
- Sync write rate limits (about 120 writes per minute): only user actions write to sync (plus `name` when it changes). Hitting the limit is handled by the revert-on-failure path above.

## Testing

Vitest with jsdom (or happy-dom) and WXT's `fakeBrowser`.

- Parser: tests against all 12 example pages in `examples/`, asserting format, course ID, section numbers, item counts, and types. Examples: Material Science I has 26 non-label items; Thermodynamics "Oct 13, 14" has 6 items (3 labels skipped); ODEs has 4 `assign` items; onetopic pages report the active section from the active tab.
- Rules: table-driven tests for precedence (item over course over global over default), done-flag retention when ignored, rule removal when the new value equals the inherited value, and the three menu-label cases from the Items example.
- Progress: per-section and course totals, onetopic with unseen sections, done cmids missing from the seen cache.
- Storage: read/write and seen-cache section replacement using `fakeBrowser`.
- UI: render on an example page twice, assert no duplicates; simulate a checkbox click and assert counts update.
- Manual: `npm run dev` against live TUM Moodle with a checklist covering one course per format.

Note: the example HTML files are saved from a logged-in session and may contain personal data. They are fine as local fixtures; strip personal data before publishing the repository.
