# Moodle Todo

A Chrome extension that turns TUM Moodle course pages into a todo list: a checkbox on every lecture file, recording, problem sheet and assignment, ignore rules for things that are not work, and progress counts per section and course. State lives in Chrome's synced storage, so it follows you across devices.

## Install for daily use

1. `npm install`
2. `npm run build`
3. Open `chrome://extensions`, enable Developer mode, click "Load unpacked" and pick `.output/chrome-mv3`.
4. Open any course on https://www.moodle.tum.de.

## Develop

- `npm run dev` opens a Chrome window with the extension and reloads on save.
- `npm test` runs the unit tests (parser tests use the saved pages in `examples/`).
- `npm run compile` type-checks.
- `.npmrc` sets `legacy-peer-deps=true` because plain `npm install` crashed with an npm arborist bug on Node 24.5; remove it once that is fixed.
- `docs/manual-test.md` is the checklist for a live check.

## How it works

- Content script on `course/view.php` and `course/section.php`. The page is parsed by `src/parse/page.ts`.
- The whole course's item list comes from Moodle's own course state service (`core_courseformat_get_state`), see `src/moodle/state.ts`. If that fails, only items seen on pages are counted.
- Ignore rules have three layers (item, course + type, global + type), resolved in `src/model/rules.ts`.
- Storage keys: `sync:global`, `sync:course:<id>` (decisions), `local:seen:<id>` (rebuildable cache).

## Refreshing the course state fixture

On a logged-in course page, run in the DevTools console:

    const r = await fetch(`/lib/ajax/service.php?sesskey=${M.cfg.sesskey}&info=core_courseformat_get_state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ index: 0, methodname: "core_courseformat_get_state", args: { courseid: M.cfg.courseId } }]) });
    copy(JSON.stringify(await r.json()));

Paste into `examples/course-state-<courseId>.json`.

## Privacy note

The files in `examples/` were saved from a logged-in session and contain a user id and session key. Strip them before publishing this repository.

Design: `docs/superpowers/specs/2026-11-10-moodle-todo-design.md`.
