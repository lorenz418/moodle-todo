# Moodle Todo: Design

Date: 2026-11-10
Status: Implemented (v1), pending live manual test

## Goal

A Chrome extension that turns TUM Moodle course pages (`https://www.moodle.tum.de`) into a todo list. The user works through lecture material and problem sheets on their own and wants to check off items directly in Moodle instead of copying them into a separate todo app.

TUM Moodle has activity completion disabled in all observed courses (no completion markup in any example page), so the extension provides its own checkboxes and stores state itself.

## Scope

### v1 (this spec)

- A checkbox on every course item (except text labels and subsection containers), directly on the course page.
- Ignore rules with three layers (item, course + type, global + type) and sensible defaults.
- Progress badges per section/tab and a progress bar per course page, covering the whole course (including tabs not yet opened) via Moodle's course state service.
- An options page to review and reset ignore rules.

### Explicitly not in v1

- Checkboxes on activity detail pages (`mod/*/view.php`).
- Dashboard (`/my/`) integration and a toolbar popup.
- Fetching other course pages in the background. (The single course-state request described below is not page fetching.)
- Cleanup of old semesters' data.
- Other Moodle instances than `www.moodle.tum.de`.

## Observed Moodle structure (from `examples/`)

Saved pages from 7 courses (12 course page files) plus the dashboard page. Three course formats appear:

| Format | Courses | Behavior |
|---|---|---|
| `format-onetopic` (tabs) | Engineering Thermodynamics, Numerische Methoden | One section per page. Tabs in `ul.format_onetopic-tabs`, each tab `a.nav-link` links to `course/view.php?id=<course>&section=<n>`. Active tab has `a.nav-link.active`. |
| `format-topics` | Modeling and Simulation with ODEs, Methods of Product Development | All sections on one page. |
| `format-weeks` | Material Science I, Nanotechnologie | All sections on one page, one per week. |

Common markup in all formats:

- Course ID: `body` class `course-<id>`.
- Course name: the course page heading `h1` (plain course name). Not the `<title>`, which carries language-dependent prefixes such as "Kurs:", "Course:", "Abschnitt: <section> | ...".
- Format: `body` class `format-<name>`.
- Section: `li.section[data-for="section"]` with `data-sectionid="<n>"` (section number, equals the `section=<n>` URL parameter) and `data-id` (database section ID). Section name from `data-sectionname` when present, otherwise the section title text.
- Item: `li.activity[data-for="cmitem"]` with `data-id="<cmid>"` and class `modtype_<type>`. Name in `div.activity-item[data-activityname]` (fallback: `.instancename` text).
- Section headings in topics/weeks courses link to `course/section.php?id=<sectionDbId>`, Moodle's single-section view. No example of that page was saved; it is assumed to use the same section/item markup and is verified manually.
- Item types seen: `resource`, `lti` (TUM-Live recordings), `url`, `folder`, `assign`, `forum`, `choice`, `label`.
- Not seen but possible in newer Moodle: `subsection` (a nested section rendered as an activity `modtype_subsection` whose content is a nested `li.section`). Treated like a label: no UI of its own; its nested section is parsed, and its items count toward the enclosing top-level section.
- Session key: the page's inline `M.cfg` script contains `"sesskey":"<value>"`. Fallback: `input[name="sesskey"]`.

The course module ID (`cmid`) is stable across renames and moves, so all state is keyed by it.

### Course state service

Every page (all three formats) includes Moodle's course index drawer, which Moodle populates after load by calling its own web service. The extension uses the same service to learn about the whole course, including onetopic tabs that have never been opened:

- Request: `POST https://www.moodle.tum.de/lib/ajax/service.php?sesskey=<sesskey>&info=core_courseformat_get_state` with body `[{"index":0,"methodname":"core_courseformat_get_state","args":{"courseid":<id>}}]`, same-origin, with cookies.
- Response: `[{"error":false,"data":"<json string>"}]`; `data` is JSON-encoded a second time and must be parsed again.
- Fields the design depends on: `section[]` with `id` (db id) and `number`; `cm[]` with `id` (cmid), `module` (type such as `resource`), `sectionid`. For subsections, `cm[]` entries of module `subsection` point to a delegated section; items in a delegated section are attributed to the section that contains the subsection cm.
- `parseCourseState` excludes the same modules the DOM parser excludes (`label`, `subsection`), so both seen-cache producers agree. Date-restricted cms (`uservisible: false`) are kept, because Moodle renders them on the page (with an availability note) and the DOM parser keeps them too; cms not shown on the course page are already absent from the state response.

This service is used by Moodle's own course index, has existed since Moodle 4.0, and is not a public API. The exact field names above must be confirmed in the user's browser before implementation (see Testing: Spike). If the call fails or the response does not match, the extension falls back to updating the seen cache from the pages it sees (fallback mode, see Data flow).

### Dashboard page (observed, not used in v1)

Recorded from `examples/Meine Startseite | TUM.html` so a later version can add course progress to the dashboard without re-investigating.

- URL `https://www.moodle.tum.de/my/` (`/my/index.php`); `body` classes `path-my pagelayout-mydashboard format-site course-1`. Note that it carries a `course-<id>` class (course 1 is Moodle's site course), so a course page must not be recognized by body classes alone.
- The course list is the third-party block `block_course_overview_campus`, rendered server-side with all enrolled courses from all semesters (82 in the example). Each course is `div#coc-course-<courseId>.row.coc-course` containing `h3 > a[href="course/view.php?id=<courseId>"]` with the course name and a `span.coc-metainfo` like `(WiSe 2026/2027 | Faculty)`. Semester filtering is done client-side by toggling `coc-hidden` on nested `div.termdiv.coc-term-<year>-<n>` elements. A future dashboard badge would attach to `#coc-course-<courseId>` and read progress from storage without any network call.
- `block_timeline`, `block_recentlyaccessedcourses`, `block_calendar_month` and `block_calendar_upcoming` are rendered client-side after load (empty placeholders in the saved HTML), so they would need a MutationObserver if ever targeted.
- Moodle's standard `block_myoverview` (course cards) is not used at TUM.

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
- Text labels (`modtype_label`) and subsection containers (`modtype_subsection`) get no UI of their own.

Display names for types: `resource` File, `lti` Recording, `url` Link, `folder` Folder, `assign` Assignment, `forum` Forum, `choice` Survey, `quiz` Quiz, `page` Page. Unknown types display their raw `modtype` name.

### Progress

- Topics/weeks courses: a badge next to each section heading, e.g. `3/7`. Turns green with a check mark when the section is complete. Sections with no tracked items show no badge.
- Onetopic courses: the same badge on each tab, for all tabs, based on the course state. Tabs whose section has no tracked items show no badge.
- Every course page: a slim progress bar at the top of the course content, "18 / 42 done".
- Fallback mode (course state unavailable): counts cover only what is in the seen cache (sections seen on a page, or a stale earlier state result), and the progress bar carries the note "Course state unavailable, counts may be incomplete".

## Ignore rules

State for an item is resolved by the most specific rule:

1. Item override for this cmid: `ignore` or `track`.
2. Course type rule for this item's type: `ignore` or `track`.
3. Global type rule for this item's type: `ignore` or `track`.
4. Default: `track`.

If the resolved rule is `ignore`, the item is `ignored`. Otherwise it is `done` if its cmid is in the course's done list, else `open`. An item's done flag is kept while it is ignored, so restoring it brings back its previous checked state.

Initial global rules on first install: `forum: ignore`, `choice: ignore`.

Menu actions change exactly one layer. Setting a layer to a value writes an explicit rule there, so a course can override a global ignore and an item can override a course ignore. Exception to keep rules from piling up: if the new value equals what the layers below would resolve to anyway, the rule at that layer is removed instead of written (for example, un-ignoring an item whose type is tracked deletes the item override). At the global layer, `track` equals the default, so tracking a type globally removes its global rule. Removal only checks the layer being changed; a rule at a more specific layer may become redundant later, which is harmless.

### Options page

- Global section: one toggle per known type (ignore or track). Known types are the types with a display name listed above, plus any other type found in a seen cache or a stored rule.
- Per course (every course that has any stored data, listed by name, falling back to "Course <id>" when no name is stored): its course type rules and the count of item overrides, with a "reset rules" button (clears type rules and item overrides, keeps checkmarks) and a "reset everything" button (also clears checkmarks), each with a confirmation.

## Architecture

WXT (pinned to 0.21.x) with TypeScript, Vitest for tests. Pure logic is separated from DOM, network and storage.

| Unit | Responsibility |
|---|---|
| `entrypoints/moodle.content.ts` | Content script, matches `https://www.moodle.tum.de/course/view.php*` and `https://www.moodle.tum.de/course/section.php*`. Wires parse, state, store, model and UI together. |
| `src/parse/page.ts` | `parsePage(document)` returns `{ courseId, courseName, format, sesskey: string | null, sections: [{ num, name, headingEl, items: [{ cmid, type, name, el }] }], tabs?: [{ num, el }] }` or `null` if the page is not a recognizable course page: no `body.course-<id>` class, or no `li.section[data-for="section"]` element present (this excludes the dashboard, which has `course-1` but no sections). The format is reported but not used to reject pages, so unseen formats with standard section markup still work. Labels and subsection containers are excluded from `items`; items inside a subsection are attributed to the enclosing top-level section. |
| `src/moodle/state.ts` | `fetchCourseState(courseId, sesskey)` calls the course state service with a 10 s timeout and returns `Record<cmid, { section: number, type: string }>` (the seen-cache shape), or `null` on any failure including a missing sesskey. `parseCourseState(json)` is the pure part: handles the double-encoded response, drops `label`/`subsection`, and attributes subsection items to the enclosing section. |
| `src/model/rules.ts` | Pure rule logic. `resolveState(item, courseData, globalData)` returns `"open" | "done" | "ignored"`. `menuState(layer, item, courseData, globalData)` returns the value currently in effect at a layer (drives menu labels). `applyMenuAction(layer, value, item, courseData, globalData)` returns updated data, writing or removing the rule per the removal rule. |
| `src/model/progress.ts` | Computes `{ done, total }` per section number and for the course from the seen cache plus stored data. Pure. |
| `src/storage/store.ts` | Typed access to the storage keys below via WXT storage. Exposes get, update and a change watcher. |
| `src/ui/` | Checkbox, hover menu, section/tab badge, progress bar. Receive state, emit user actions. No storage or network access. |
| `entrypoints/options/` | Options page as described above. |

### Storage

`chrome.storage.sync` (user decisions, synced across the user's Chrome devices):

- `global`: `{ typeRules: Record<type, "ignore" | "track"> }`
- `course:<courseId>`: `{ name: string, done: number[], itemOverrides: Record<cmid, "ignore" | "track">, typeRules: Record<type, "ignore" | "track"> }`

`chrome.storage.local` (rebuildable cache):

- `seen:<courseId>`: `Record<cmid, { section: number, type: string }>`

The seen cache is local because it is derived data (from the course state service or, in fallback mode, from parsed pages) and could grow large.

Size check: `course:<id>` stores cmids as numbers; roughly 900 checkmarks fit in Chrome's 8 KB per-key sync limit, well above any observed course (largest: 26 items).

### Data flow

1. Course page loads; content script runs `parsePage`. If `null`, stop and log one console warning.
2. Update the seen cache:
   - Call `fetchCourseState`. On success, replace `seen:<courseId>` entirely with the result (authoritative for the whole course, removes items deleted by the teacher).
   - On failure, fall back: for every section present on the page, replace cached entries of that section with the items currently on the page; leave other sections untouched. Mark the render as fallback mode.
3. Load `global` and `course:<id>`. On `course/view.php` only, write `name` into `course:<id>` if missing or changed (on `section.php` the heading may show the section name).
4. Resolve each item's state and render checkboxes, menus, badges, and the progress bar. Checkboxes are rendered before the state call returns (they need only the page and stored data); badges and the progress bar render once the seen cache is updated.
5. User action: apply the change to the UI immediately (optimistic), then write to storage. The storage watcher re-renders from the stored state, which confirms the change; if the write fails, the UI is reverted (see Error handling).
6. Watch storage changes for `global` and this course's keys, re-render on change (keeps multiple tabs consistent).

Counting: total = seen items whose resolved state is not `ignored`; done = those whose state is `done`. Checkmarks for cmids not in the seen cache are not counted.

### Rendering

- Idempotent: rendering again updates existing injected elements instead of adding new ones (injected elements carry a dedicated class/data attribute).
- Injected styles are scoped under a unique class prefix to avoid clashing with Moodle's CSS.

## Error handling

- Unrecognized page: do nothing, one console warning.
- Course state call fails (network error, non-200, `error: true`, missing sesskey, 10 s timeout, or unexpected shape): one console warning, fallback mode as described above. The extension never blocks on the call; checkboxes work regardless, and badges render from the fallback cache once the failure is known.
- Storage write fails (e.g. sync quota): revert the optimistic UI change and show a short message in the progress bar.
- Concurrent tabs: changes from other tabs arrive via the storage watcher. Each write re-reads the current key value right before modifying it (never writes a cached snapshot), so in practice tabs do not overwrite each other. Two clicks in different tabs within milliseconds could still lose one update; that is accepted.
- Sync write rate limits (about 120 writes per minute): only user actions write to sync (plus `name` when it changes). Hitting the limit is handled by the revert-on-failure path above.

## Testing

Vitest with jsdom (or happy-dom) and WXT's `fakeBrowser`.

- Spike (before implementation): the user runs the course state request from the browser console on a logged-in TUM Moodle course page and saves the response as `examples/course-state-<courseId>.json`. This confirms the service exists at TUM and fixes the field names. If the shape differs from the assumptions above, update this spec's "Course state service" section before planning the state module.
- Parser: tests against all 12 course page examples in `examples/`, asserting format, course ID, section numbers, item counts, types, and sesskey extraction. Examples: Material Science I has 26 non-label items; Thermodynamics "Oct 13, 14" has 6 items (3 labels skipped); ODEs has 4 `assign` items. The dashboard page (`Meine Startseite | TUM.html`) is the `parsePage` returns `null` case.
- Course state: `parseCourseState` tested against the saved spike response plus a hand-written fixture containing a label, a subsection and a date-restricted cm (kept); double-encoding handled; excluded modules absent from the result; malformed input returns `null`.
- Rules: table-driven tests for precedence (item over course over global over default), done-flag retention when ignored, rule removal when the new value equals the inherited value, and the three menu-label cases from the Items example.
- Progress: per-section and course totals, fallback mode with unseen sections, done cmids missing from the seen cache.
- Storage: read/write, full seen-cache replacement, and fallback per-section replacement using `fakeBrowser`.
- UI: render on an example page twice, assert no duplicates; simulate a checkbox click and assert counts update.
- Manual: `npm run dev` against live TUM Moodle with a checklist covering one course per format, a `section.php` page, and fallback mode (simulated by blocking the service URL in DevTools).

Note: the example HTML files and the spike JSON are saved from a logged-in session and may contain personal data (user ID, session key, name). They are fine as local fixtures; strip personal data before publishing the repository.

## Implementation notes

- Controls are placed outside Moodle's `.activity-grid` (inside `.activity-item`, flex layout) so the grid layout does not move them.
- Storage writes go through a serialized queue, and `updateCourseWithGlobal` reads the global rules at write time to avoid lost updates.
- The `setGlobalTypeRule` helper is used by the options page.
- Extension context invalidation disables the controls and shows a reload message.
