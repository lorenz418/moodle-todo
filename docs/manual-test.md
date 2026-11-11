# Manual test checklist

Run `npm run dev`. WXT opens a Chrome window with the extension loaded and reloads it on every save. Log in to https://www.moodle.tum.de in that window.

Repeat the course checks on one course per format:
- weeks: Nanotechnologie (id 120985)
- topics: Modeling and Simulation with ODEs (id 123555)
- onetopic: Engineering Thermodynamics (id 125111)

## Before starting

- [ ] Capture `examples/course-state-125111.json` with the README snippet.
- [ ] Confirm `cm[].module`, `cm[].sectionid`, `section[].id` and `section[].number` exist in it.
- [ ] Run `npm test` so the previously skipped real-response test runs.

## Course page

- [ ] Every file, recording, link, folder and assignment has a checkbox left of its icon. Labels have nothing.
- [ ] The checkbox sits left of the item icon, the ⋯ button at the far right of the row.
- [ ] Announcement forums and surveys have no checkbox and look faded.
- [ ] Clicking a checkbox fades the row and strikes the title. Reload: it stays checked.
- [ ] The progress bar at the top shows "n / m done" without an "unavailable" note (state service worked). m matches the count of tracked items in the whole course.
- [ ] Section (or tab) badges show done/total; a fully done section turns green.
- [ ] onetopic only: tabs you have never opened also show badges.
- [ ] An item marked "Verfügbar ab ..." (e.g. Methods of Product Development, id 123093) has a checkbox, and checking it changes the bar and the section badge.
- [ ] onetopic only: if a course has second-level tabs, note whether they show badges (not supported in v1).
- [ ] Hover a row: the "⋯" button appears. The menu offers Ignore this item / Ignore all <Type> in this course / Ignore all <Type> everywhere.
- [ ] Open the menu on the second-to-last item: it covers the next row and its entries are clickable (not the next row's ⋯ button).
- [ ] "Ignore this item": checkbox disappears, counts drop by one. Menu now offers "Track this item"; clicking it restores the checkbox with its previous checked state.
- [ ] "Ignore all Link everywhere": links lose their checkbox on another course too.
- [ ] Open the same course in a second tab, check an item there: the first tab updates without reload.
- [ ] Click a section title (topics/weeks) to open `course/section.php?id=...`: checkboxes and the bar appear there too; checking an item there is reflected on the course page.

## Fallback mode

- [ ] DevTools > Network > right-click any `service.php` request > Block request URL, then reload the course. The bar shows "Course state unavailable, counts may be incomplete"; checkboxes still work; on onetopic only opened tabs have badges. Unblock and reload: the note disappears.

## Options page

- [ ] chrome://extensions > Moodle Todo > Details > Extension options opens the page in a tab.
- [ ] Global toggles reflect the defaults (Forum and Survey ignored). Changing one updates open course pages live.
- [ ] Each visited course is listed by name with its rules and override count. "Reset rules" asks for confirmation and keeps checkmarks; "Reset everything" clears checkmarks too.

## Dashboard

- [ ] On https://www.moodle.tum.de/my/ the extension does nothing and logs nothing except, at most, one "not a recognizable course page" warning (it should not even run there since the URL does not match).
