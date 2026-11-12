# Moodle Todo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that adds persistent todo checkboxes, ignore rules and progress counts to TUM Moodle course pages.

**Architecture:** A WXT content script runs on `www.moodle.tum.de` course pages. Pure modules parse the page DOM (`src/parse`), parse Moodle's course-state JSON (`src/moodle`), resolve ignore rules and progress (`src/model`), and a thin store wraps `chrome.storage` (`src/storage`). `src/ui` renders idempotently from a model; `src/app.ts` wires everything. An options page lists and resets rules.

**Tech Stack:** WXT 0.21.x (Vite, Manifest V3), TypeScript 5.9, Vitest 4 with jsdom, WXT `fakeBrowser` for storage tests. No UI framework.

**Spec:** `docs/superpowers/specs/2026-11-10-moodle-todo-design.md`. Read it first; it defines every behavior below.

**Conventions for every task:**
- Run tests with `npm test` (alias for `vitest run`). Run a single file with `npx vitest run <path>`.
- Commit after each task with the message given. Append the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as a second `-m` argument.
- No em dashes in code comments, UI strings or docs.
- Storage object keys are strings. A `cmid` is a `number` in code and `String(cmid)` as an object key.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.ts` | Tooling |
| `entrypoints/moodle.content.ts` | Content script entry: match patterns, calls `parsePage`, starts `App` |
| `entrypoints/options/index.html`, `main.ts`, `style.css` | Options page |
| `src/types.ts` | Shared types and defaults |
| `src/model/typeNames.ts` | Display names for module types |
| `src/parse/page.ts` | `parsePage(doc)`: DOM to `ParsedPage` |
| `src/moodle/state.ts` | `parseCourseState(json)`, `fetchCourseState(courseId, sesskey)` |
| `src/model/rules.ts` | `resolveState`, `menuState`, `applyMenuAction`, `toggleDone` |
| `src/model/progress.ts` | `computeProgress(seen, course, global)` |
| `src/storage/store.ts` | Typed storage access and watchers |
| `src/ui/styles.css` | All injected styles, prefixed `mtd-` |
| `src/ui/render.ts` | `render(doc, model)`, `installHandlers(doc, handlers)` |
| `src/app.ts` | `App`: load, fetch state, render, persist, watch |
| `tests/setup.ts`, `tests/fixtures.ts` | Vitest setup, example-page loader |
| `tests/**/*.test.ts` | One test file per module |
| `docs/manual-test.md` | Manual checklist against live Moodle |
| `README.md` | Install, dev, build, spike instructions |

---

### Task 0: Spike: capture the course state response (user action, non-blocking)

This task is done by the user in their browser. Tasks 1 to 6 and 8 do not depend on it. Task 7 (course state module) uses its result. If the result is not available when Task 7 starts, implement Task 7 against the assumed shape in the spec and revisit when the file exists.

**Files:**
- Create: `examples/course-state-125111.json` (saved by the user)

- [ ] **Step 1: Ask the user to run this in the DevTools console on `https://www.moodle.tum.de/course/view.php?id=125111` (Engineering Thermodynamics, a onetopic course) while logged in**

```js
const r = await fetch(`/lib/ajax/service.php?sesskey=${M.cfg.sesskey}&info=core_courseformat_get_state`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([{ index: 0, methodname: "core_courseformat_get_state", args: { courseid: M.cfg.courseId } }]),
});
copy(JSON.stringify(await r.json()));
```

`copy(...)` puts the response on the clipboard. Paste it into `examples/course-state-125111.json`.

- [ ] **Step 2: Check the shape against the spec**

Run: `node -e "const d=JSON.parse(JSON.parse(require('fs').readFileSync('examples/course-state-125111.json','utf8'))[0].data); console.log(Object.keys(d)); console.log(d.cm[0]); console.log(d.section[0]); console.log('cms',d.cm.length,'sections',d.section.length)"`

Expected: keys include `cm` and `section`; a `cm` entry has `id`, `module`, `sectionid`; a `section` entry has `id`, `number`. Note any visibility field on `cm` (e.g. `uservisible`, `visible`) and any delegated-section fields on `section` (e.g. `component`, `itemid`). If names differ from the spec, update the spec's "Course state service" subsection and the field names in Task 7 before implementing it.

- [ ] **Step 3: Commit**

```bash
git add examples/course-state-125111.json
git commit -m "test: add course state fixture from TUM Moodle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Scaffold the WXT project

**Files:**
- Create: `package.json`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.ts`, `tests/setup.ts`, `tests/smoke.test.ts`, `entrypoints/moodle.content.ts` (placeholder)
- Modify: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "moodle-todo",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "postinstall": "wxt prepare"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "jsdom": "^31.0.0",
    "typescript": "~5.9.3",
    "vitest": "^4.1.12",
    "wxt": "~0.21.5"
  }
}
```

- [ ] **Step 2: Create `wxt.config.ts`**

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Moodle Todo",
    description: "Check off lectures and problem sheets directly on TUM Moodle course pages.",
    permissions: ["storage"],
  },
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 5: Create `tests/setup.ts`**

```ts
import { beforeEach } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

beforeEach(() => {
  fakeBrowser.reset();
});
```

- [ ] **Step 6: Create a placeholder content script so `wxt prepare` has an entrypoint**

`entrypoints/moodle.content.ts`:

```ts
import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
  matches: [
    "https://www.moodle.tum.de/course/view.php*",
    "https://www.moodle.tum.de/course/section.php*",
  ],
  runAt: "document_idle",
  main() {
    console.log("[moodle-todo] loaded");
  },
});
```

- [ ] **Step 7: Create `tests/smoke.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { storage } from "wxt/utils/storage";

describe("test setup", () => {
  it("has a DOM", () => {
    const div = document.createElement("div");
    div.textContent = "hi";
    expect(div.textContent).toBe("hi");
  });

  it("has a fake browser with working storage", async () => {
    await storage.setItem("sync:x", 1);
    expect(await storage.getItem("sync:x")).toBe(1);
    fakeBrowser.reset();
    expect(await storage.getItem("sync:x")).toBeNull();
  });
});
```

- [ ] **Step 8: Update `.gitignore`**

Replace the file contents with:

```
node_modules/
.output/
.wxt/
.DS_Store
```

- [ ] **Step 9: Install and run**

Run: `npm install`
Expected: completes; `wxt prepare` runs via postinstall and creates `.wxt/`.

Run: `npm test`
Expected: 2 tests pass.

Run: `npm run build && node -e "const m=require('./.output/chrome-mv3/manifest.json'); console.log(m.permissions, m.content_scripts[0].matches)"`
Expected: `[ 'storage' ] [ 'https://www.moodle.tum.de/course/view.php*', 'https://www.moodle.tum.de/course/section.php*' ]`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json wxt.config.ts tsconfig.json vitest.config.ts tests entrypoints .gitignore
git commit -m "chore: scaffold WXT project with vitest and fake browser" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Shared types and type display names

**Files:**
- Create: `src/types.ts`, `src/model/typeNames.ts`, `tests/model/typeNames.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/model/typeNames.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KNOWN_TYPES, typeName } from "../../src/model/typeNames";

describe("typeName", () => {
  it("maps known module types to display names", () => {
    expect(typeName("resource")).toBe("File");
    expect(typeName("lti")).toBe("Recording");
    expect(typeName("choice")).toBe("Survey");
  });

  it("falls back to the raw type", () => {
    expect(typeName("h5pactivity")).toBe("h5pactivity");
  });

  it("lists the known types", () => {
    expect(KNOWN_TYPES).toEqual([
      "resource", "lti", "url", "folder", "assign", "forum", "choice", "quiz", "page",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/model/typeNames.test.ts`
Expected: FAIL, cannot find module `../../src/model/typeNames`.

- [ ] **Step 3: Create `src/types.ts`**

```ts
export type Rule = "ignore" | "track";
export type ItemState = "open" | "done" | "ignored";
export type Layer = "item" | "course" | "global";

export interface GlobalData {
  typeRules: Record<string, Rule>;
}

export interface CourseData {
  name: string;
  done: number[];
  /** Keyed by String(cmid). */
  itemOverrides: Record<string, Rule>;
  typeRules: Record<string, Rule>;
}

/** Keyed by String(cmid). */
export type SeenCache = Record<string, { section: number; type: string }>;

export interface RuleItem {
  cmid: number;
  type: string;
}

export interface ParsedItem extends RuleItem {
  name: string;
  el: HTMLElement;
}

export interface ParsedSection {
  num: number;
  name: string;
  headingEl: HTMLElement | null;
  items: ParsedItem[];
}

export interface ParsedTab {
  num: number;
  el: HTMLAnchorElement;
}

export interface ParsedPage {
  courseId: number;
  courseName: string;
  format: string;
  sesskey: string | null;
  sections: ParsedSection[];
  /** Present on onetopic (tab) courses, otherwise null. */
  tabs: ParsedTab[] | null;
}

export const DEFAULT_GLOBAL: GlobalData = {
  typeRules: { forum: "ignore", choice: "ignore" },
};

export function emptyCourse(): CourseData {
  return { name: "", done: [], itemOverrides: {}, typeRules: {} };
}
```

- [ ] **Step 4: Create `src/model/typeNames.ts`**

```ts
const NAMES: Record<string, string> = {
  resource: "File",
  lti: "Recording",
  url: "Link",
  folder: "Folder",
  assign: "Assignment",
  forum: "Forum",
  choice: "Survey",
  quiz: "Quiz",
  page: "Page",
};

export const KNOWN_TYPES = Object.keys(NAMES);

export function typeName(type: string): string {
  return NAMES[type] ?? type;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run tests/model/typeNames.test.ts`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/model/typeNames.ts tests/model/typeNames.test.ts
git commit -m "feat: add shared types and module type display names" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Page parser

**Files:**
- Create: `tests/fixtures.ts`, `tests/parse/page.test.ts`, `src/parse/page.ts`

- [ ] **Step 1: Create the fixture loader `tests/fixtures.ts`**

File names contain spaces, `|`, `:` and `Ü`. The loader matches names after Unicode normalization so macOS file-name encoding does not matter.

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXAMPLES_DIR = join(__dirname, "..", "examples");

export const PAGES = {
  nano: "Kurs: Nanotechnologie | TUM.html",
  matsci: "Kurs: Material Science I (for MSE) | TUM.html",
  odes: "Course: Modeling and Simulation with ODEs [MA9803] | TUM.html",
  mpd: "Kurs: Methods of Product Development - 0249955018 | TUM.html",
  thermoHome: "Kurs: Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  thermoNotes: "Abschnitt: Lecture notes | Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  thermoOct13: "Abschnitt: Oct 13, 14 | Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  thermoOct27: "Abschnitt: Oct 27 | Engineering Thermodynamics (WiSe 26:27) | TUM.html",
  numHome: "Kurs: Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  numAufzeichnungen: "Abschnitt: Aufzeichnungen | Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  numVorlesung: "Abschnitt: Vorlesung | Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  numUebung: "Abschnitt: Übung | Numerische Methoden im Ingenieurwesen (MW1925) | TUM.html",
  dashboard: "Meine Startseite | TUM.html",
} as const;

export type PageKey = keyof typeof PAGES;

const cache = new Map<string, string>();

export function readExample(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const wanted = name.normalize("NFC");
  const actual = readdirSync(EXAMPLES_DIR).find((f) => f.normalize("NFC") === wanted);
  if (!actual) throw new Error(`Example file not found: ${name}`);
  const html = readFileSync(join(EXAMPLES_DIR, actual), "utf8");
  cache.set(name, html);
  return html;
}

export function loadPage(key: PageKey): Document {
  return new DOMParser().parseFromString(readExample(PAGES[key]), "text/html");
}
```

- [ ] **Step 2: Write the failing parser tests `tests/parse/page.test.ts`**

The expected numbers were measured from the example files with the same selectors the parser uses.

```ts
import { describe, expect, it } from "vitest";
import { parsePage } from "../../src/parse/page";
import { loadPage, type PageKey } from "../fixtures";

interface Expected {
  courseId: number;
  courseName: string;
  format: string;
  sectionNums: number[];
  items: number;
  types: Record<string, number>;
  tabs: number | null;
}

const EXPECTED: Record<Exclude<PageKey, "dashboard">, Expected> = {
  nano: { courseId: 120985, courseName: "Nanotechnologie", format: "weeks", sectionNums: range(18), items: 10, types: { forum: 1, resource: 4, lti: 4, choice: 1 }, tabs: null },
  matsci: { courseId: 122101, courseName: "Material Science I (for MSE)", format: "weeks", sectionNums: range(18), items: 26, types: { forum: 1, resource: 25 }, tabs: null },
  odes: { courseId: 123555, courseName: "Modeling and Simulation with ODEs [MA9803]", format: "topics", sectionNums: range(6), items: 12, types: { forum: 4, choice: 1, url: 3, assign: 4 }, tabs: null },
  mpd: { courseId: 123093, courseName: "Methods of Product Development - 0249955018", format: "topics", sectionNums: range(13), items: 14, types: { forum: 2, folder: 1, url: 3, resource: 6, lti: 2 }, tabs: null },
  thermoHome: { courseId: 125111, courseName: "Engineering Thermodynamics (WiSe 26/27)", format: "onetopic", sectionNums: [0], items: 4, types: { forum: 2, resource: 1, url: 1 }, tabs: 11 },
  thermoNotes: { courseId: 125111, courseName: "Engineering Thermodynamics (WiSe 26/27)", format: "onetopic", sectionNums: [2], items: 1, types: { resource: 1 }, tabs: 11 },
  thermoOct13: { courseId: 125111, courseName: "Engineering Thermodynamics (WiSe 26/27)", format: "onetopic", sectionNums: [4], items: 6, types: { resource: 5, url: 1 }, tabs: 11 },
  thermoOct27: { courseId: 125111, courseName: "Engineering Thermodynamics (WiSe 26/27)", format: "onetopic", sectionNums: [6], items: 7, types: { lti: 3, resource: 2, url: 2 }, tabs: 11 },
  numHome: { courseId: 125846, courseName: "Numerische Methoden im Ingenieurwesen (MW1925)", format: "onetopic", sectionNums: [0], items: 3, types: { forum: 2, resource: 1 }, tabs: 7 },
  numAufzeichnungen: { courseId: 125846, courseName: "Numerische Methoden im Ingenieurwesen (MW1925)", format: "onetopic", sectionNums: [1], items: 8, types: { lti: 8 }, tabs: 7 },
  numVorlesung: { courseId: 125846, courseName: "Numerische Methoden im Ingenieurwesen (MW1925)", format: "onetopic", sectionNums: [2], items: 12, types: { resource: 12 }, tabs: 7 },
  numUebung: { courseId: 125846, courseName: "Numerische Methoden im Ingenieurwesen (MW1925)", format: "onetopic", sectionNums: [3], items: 11, types: { resource: 9, folder: 2 }, tabs: 7 },
};

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe("parsePage", () => {
  it.each(Object.entries(EXPECTED))("parses %s", (key, exp) => {
    const page = parsePage(loadPage(key as PageKey));
    expect(page).not.toBeNull();
    const p = page!;
    expect(p.courseId).toBe(exp.courseId);
    expect(p.courseName).toBe(exp.courseName);
    expect(p.format).toBe(exp.format);
    expect(p.sesskey).toMatch(/^\w{10}$/);
    expect(p.sections.map((s) => s.num)).toEqual(exp.sectionNums);
    const items = p.sections.flatMap((s) => s.items);
    expect(items).toHaveLength(exp.items);
    const counts: Record<string, number> = {};
    for (const it of items) counts[it.type] = (counts[it.type] ?? 0) + 1;
    expect(counts).toEqual(exp.types);
    if (exp.tabs === null) expect(p.tabs).toBeNull();
    else expect(p.tabs).toHaveLength(exp.tabs);
  });

  it("returns null for the dashboard (has course-1 but no sections)", () => {
    expect(parsePage(loadPage("dashboard"))).toBeNull();
  });

  it("returns null for an empty document", () => {
    expect(parsePage(new DOMParser().parseFromString("<html><body></body></html>", "text/html"))).toBeNull();
  });

  it("skips labels and reads item names and elements", () => {
    const p = parsePage(loadPage("thermoOct13"))!;
    const items = p.sections[0]!.items;
    expect(items.map((i) => i.cmid)).toEqual([3957903, 3957904, 3957905, 3957910, 3957911, 3957912]);
    expect(items[1]!.name).toBe("Problem sheet 1");
    expect(items[1]!.el.id).toBe("module-3957904");
    expect(items.every((i) => i.el.matches("li.activity"))).toBe(true);
  });

  it("reads section names, headings and per-section items on a weeks course", () => {
    const p = parsePage(loadPage("nano"))!;
    const s1 = p.sections[1]!;
    expect(s1.num).toBe(1);
    expect(s1.name).toBe("13. Oktober - 19. Oktober");
    expect(s1.headingEl?.classList.contains("sectionname")).toBe(true);
    expect(s1.items).toHaveLength(2);
    expect(p.sections[0]!.items).toHaveLength(1);
    expect(p.sections[2]!.items).toHaveLength(3);
  });

  it("puts the four assignments in the Exercises section of the ODEs course", () => {
    const p = parsePage(loadPage("odes"))!;
    const exercises = p.sections.find((s) => s.name === "Exercises")!;
    expect(exercises.num).toBe(4);
    expect(exercises.items.map((i) => i.type)).toEqual(["assign", "assign", "assign", "assign"]);
  });

  it("maps onetopic tabs to section numbers", () => {
    const p = parsePage(loadPage("thermoOct27"))!;
    expect(p.tabs!.map((t) => t.num)).toEqual(range(11));
    expect(p.tabs![6]!.el.classList.contains("active")).toBe(true);
  });

  it("attributes items inside a subsection to the enclosing section and skips the subsection itself", () => {
    const html = `<html><body class="course-999 format-topics">
      <h1>Sub Course</h1>
      <ul data-for="course_sectionlist">
        <li class="section course-section" data-for="section" data-sectionid="1" data-id="11" data-sectionname="Week 1">
          <div class="section-item"><h3 class="sectionname"><a href="#">Week 1</a></h3></div>
          <ul data-for="cmlist">
            <li class="activity resource modtype_resource" id="module-1" data-for="cmitem" data-id="1">
              <div class="activity-item" data-activityname="Slides"></div></li>
            <li class="activity subsection modtype_subsection" id="module-2" data-for="cmitem" data-id="2">
              <div class="activity-item" data-activityname="Extra">
                <ul class="subsection-list">
                  <li class="section course-section" data-for="section" data-sectionid="5" data-id="55" data-sectionname="Extra">
                    <div class="section-item"><h3 class="sectionname">Extra</h3></div>
                    <ul data-for="cmlist">
                      <li class="activity url modtype_url" id="module-3" data-for="cmitem" data-id="3">
                        <div class="activity-item" data-activityname="Video"></div></li>
                    </ul>
                  </li>
                </ul>
              </div></li>
          </ul>
        </li>
      </ul></body></html>`;
    const p = parsePage(new DOMParser().parseFromString(html, "text/html"))!;
    expect(p.sections).toHaveLength(1);
    expect(p.sections[0]!.num).toBe(1);
    expect(p.sections[0]!.headingEl?.textContent?.trim()).toBe("Week 1");
    expect(p.sections[0]!.items.map((i) => [i.cmid, i.type])).toEqual([[1, "resource"], [3, "url"]]);
    expect(p.sesskey).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/parse/page.test.ts`
Expected: FAIL, cannot find module `../../src/parse/page`.

- [ ] **Step 4: Implement `src/parse/page.ts`**

```ts
import type { ParsedItem, ParsedPage, ParsedSection, ParsedTab } from "../types";

const SECTION_SELECTOR = 'li.section[data-for="section"]';
const ITEM_SELECTOR = 'li.activity[data-for="cmitem"]';
const SKIPPED_TYPES = new Set(["label", "subsection"]);

/**
 * Reads a Moodle course page. Returns null when the document is not a
 * recognizable course page (no body.course-<id>, or no section markup).
 */
export function parsePage(doc: Document): ParsedPage | null {
  const body = doc.body;
  if (!body) return null;
  const courseId = classNumber(body, "course-");
  if (courseId === null) return null;

  const allSections = Array.from(doc.querySelectorAll<HTMLElement>(SECTION_SELECTOR));
  if (allSections.length === 0) return null;
  const topLevel = allSections.filter((el) => !el.parentElement?.closest(SECTION_SELECTOR));

  return {
    courseId,
    courseName: doc.querySelector("h1")?.textContent?.trim() ?? "",
    format: classSuffix(body, "format-") ?? "unknown",
    sesskey: findSesskey(doc),
    sections: topLevel.map(parseSection),
    tabs: parseTabs(doc),
  };
}

function parseSection(el: HTMLElement): ParsedSection {
  const num = Number(el.dataset.sectionid ?? el.dataset.number ?? NaN);
  const headingEl = firstOwned(el, ".sectionname");
  const name = el.dataset.sectionname?.trim() || headingEl?.textContent?.trim() || `Section ${num}`;
  const items = Array.from(el.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    .map(parseItem)
    .filter((i): i is ParsedItem => i !== null);
  return { num, name, headingEl, items };
}

function parseItem(el: HTMLElement): ParsedItem | null {
  const cmid = Number(el.dataset.id);
  const type = classSuffix(el, "modtype_");
  if (!Number.isFinite(cmid) || !type || SKIPPED_TYPES.has(type)) return null;
  const name =
    el.querySelector<HTMLElement>(".activity-item[data-activityname]")?.dataset.activityname?.trim() ||
    instanceName(el) ||
    `#${cmid}`;
  return { cmid, type, name, el };
}

/** The .instancename text without its hidden ".accesshide" suffix (e.g. "Datei"). */
function instanceName(el: HTMLElement): string {
  const span = el.querySelector(".instancename");
  if (!span) return "";
  const clone = span.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".accesshide").forEach((n) => n.remove());
  return clone.textContent?.trim() ?? "";
}

function parseTabs(doc: Document): ParsedTab[] | null {
  const list = doc.querySelector("ul.format_onetopic-tabs");
  if (!list) return null;
  const tabs: ParsedTab[] = [];
  for (const a of Array.from(list.querySelectorAll<HTMLAnchorElement>("a.nav-link"))) {
    const m = /[?&]section=(\d+)/.exec(a.getAttribute("href") ?? "");
    if (m) tabs.push({ num: Number(m[1]), el: a });
  }
  return tabs;
}

function findSesskey(doc: Document): string | null {
  for (const script of Array.from(doc.querySelectorAll("script"))) {
    const m = /"sesskey":"([^"]+)"/.exec(script.textContent ?? "");
    if (m) return m[1] ?? null;
  }
  const input = doc.querySelector<HTMLInputElement>('input[name="sesskey"]');
  return input?.value || null;
}

/** First descendant matching `selector` whose closest section is `sectionEl` itself. */
function firstOwned(sectionEl: HTMLElement, selector: string): HTMLElement | null {
  for (const el of Array.from(sectionEl.querySelectorAll<HTMLElement>(selector))) {
    if (el.closest(SECTION_SELECTOR) === sectionEl) return el;
  }
  return null;
}

function classSuffix(el: Element, prefix: string): string | null {
  for (const c of Array.from(el.classList)) {
    if (c.startsWith(prefix) && c.length > prefix.length) return c.slice(prefix.length);
  }
  return null;
}

function classNumber(el: Element, prefix: string): number | null {
  const s = classSuffix(el, prefix);
  if (s === null || !/^\d+$/.test(s)) return null;
  return Number(s);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/parse/page.test.ts`
Expected: all pass (12 `it.each` cases plus 7 more). If a count differs, inspect the page with `grep -o 'modtype_[a-z]*' "examples/<file>" | sort | uniq -c` before changing an expectation; the expectations were measured and should match.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures.ts tests/parse/page.test.ts src/parse/page.ts
git commit -m "feat: parse Moodle course pages into sections, items and tabs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rule resolution and menu actions

**Files:**
- Create: `tests/model/rules.test.ts`, `src/model/rules.ts`

- [ ] **Step 1: Write the failing tests**

`tests/model/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyMenuAction, menuState, resolveState, toggleDone } from "../../src/model/rules";
import { DEFAULT_GLOBAL, emptyCourse, type CourseData, type GlobalData } from "../../src/types";

const forum = { cmid: 10, type: "forum" };
const file = { cmid: 20, type: "resource" };

function course(partial: Partial<CourseData> = {}): CourseData {
  return { ...emptyCourse(), ...partial };
}

describe("resolveState precedence", () => {
  it.each([
    ["default is track", course(), { typeRules: {} }, file, "open"],
    ["global ignore", course(), DEFAULT_GLOBAL, forum, "ignored"],
    ["course track beats global ignore", course({ typeRules: { forum: "track" } }), DEFAULT_GLOBAL, forum, "open"],
    ["course ignore beats global default", course({ typeRules: { resource: "ignore" } }), { typeRules: {} }, file, "ignored"],
    ["item track beats course ignore", course({ typeRules: { resource: "ignore" }, itemOverrides: { "20": "track" } }), { typeRules: {} }, file, "open"],
    ["item ignore beats everything", course({ typeRules: { resource: "track" }, itemOverrides: { "20": "ignore" } }), { typeRules: {} }, file, "ignored"],
    ["done when tracked and in done list", course({ done: [20] }), { typeRules: {} }, file, "done"],
    ["ignored even if in done list", course({ done: [10] }), DEFAULT_GLOBAL, forum, "ignored"],
  ] as const)("%s", (_name, c, g: GlobalData, item, expected) => {
    expect(resolveState(item, c, g)).toBe(expected);
  });

  it("keeps the done flag while ignored so restoring brings it back", () => {
    const c = course({ done: [10], itemOverrides: { "10": "ignore" } });
    expect(resolveState(forum, c, { typeRules: {} })).toBe("ignored");
    const restored = applyMenuAction("item", "track", forum, c, { typeRules: {} }).course;
    expect(resolveState(forum, restored, { typeRules: {} })).toBe("done");
  });
});

describe("menuState (labels) for the spec example: forums ignored globally, one forum tracked by override", () => {
  const c = course({ itemOverrides: { "10": "track" } });
  it("item layer reflects the item's effective rule", () => {
    expect(menuState("item", forum, c, DEFAULT_GLOBAL)).toBe("track");
  });
  it("course layer falls back to the global rule", () => {
    expect(menuState("course", forum, c, DEFAULT_GLOBAL)).toBe("ignore");
  });
  it("global layer reads the global rule", () => {
    expect(menuState("global", forum, c, DEFAULT_GLOBAL)).toBe("ignore");
  });
});

describe("applyMenuAction writes or removes rules", () => {
  it("writes an item override when it differs from the inherited value", () => {
    const r = applyMenuAction("item", "ignore", file, course(), { typeRules: {} });
    expect(r.course.itemOverrides).toEqual({ "20": "ignore" });
    expect(r.global).toEqual({ typeRules: {} });
  });

  it("removes an item override when the new value equals the inherited value", () => {
    const c = course({ itemOverrides: { "20": "ignore" } });
    const r = applyMenuAction("item", "track", file, c, { typeRules: {} });
    expect(r.course.itemOverrides).toEqual({});
  });

  it("spec example: ignoring the tracked forum item removes the override (global already ignores)", () => {
    const c = course({ itemOverrides: { "10": "track" } });
    const r = applyMenuAction("item", "ignore", forum, c, DEFAULT_GLOBAL);
    expect(r.course.itemOverrides).toEqual({});
    expect(resolveState(forum, r.course, DEFAULT_GLOBAL)).toBe("ignored");
  });

  it("spec example: tracking forums in the course writes a course rule", () => {
    const r = applyMenuAction("course", "track", forum, course(), DEFAULT_GLOBAL);
    expect(r.course.typeRules).toEqual({ forum: "track" });
  });

  it("spec example: tracking forums globally removes the global rule (track is the default)", () => {
    const r = applyMenuAction("global", "track", forum, course(), DEFAULT_GLOBAL);
    expect(r.global.typeRules).toEqual({ choice: "ignore" });
  });

  it("ignoring a type globally writes a global rule", () => {
    const r = applyMenuAction("global", "ignore", file, course(), { typeRules: {} });
    expect(r.global.typeRules).toEqual({ resource: "ignore" });
  });

  it("removes a course rule that equals the global rule", () => {
    const c = course({ typeRules: { forum: "ignore" } });
    const r = applyMenuAction("course", "ignore", forum, c, DEFAULT_GLOBAL);
    expect(r.course.typeRules).toEqual({});
  });

  it("does not mutate its inputs", () => {
    const c = course();
    const g: GlobalData = { typeRules: {} };
    applyMenuAction("item", "ignore", file, c, g);
    applyMenuAction("global", "ignore", file, c, g);
    expect(c).toEqual(course());
    expect(g).toEqual({ typeRules: {} });
  });
});

describe("toggleDone", () => {
  it("adds and removes cmids, keeps the list sorted and unique", () => {
    let c = toggleDone(course({ done: [30] }), 20, true);
    expect(c.done).toEqual([20, 30]);
    c = toggleDone(c, 20, true);
    expect(c.done).toEqual([20, 30]);
    c = toggleDone(c, 30, false);
    expect(c.done).toEqual([20]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/model/rules.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/model/rules.ts`**

```ts
import type { CourseData, GlobalData, ItemState, Layer, Rule, RuleItem } from "../types";

const LAYERS: Layer[] = ["item", "course", "global"];

function ruleAt(layer: Layer, item: RuleItem, course: CourseData, global: GlobalData): Rule | undefined {
  switch (layer) {
    case "item":
      return course.itemOverrides[String(item.cmid)];
    case "course":
      return course.typeRules[item.type];
    case "global":
      return global.typeRules[item.type];
  }
}

/** Rule in effect from `layer` downward: that layer, then the less specific ones, then the default. */
function effectiveRule(layer: Layer, item: RuleItem, course: CourseData, global: GlobalData): Rule {
  for (const l of LAYERS.slice(LAYERS.indexOf(layer))) {
    const r = ruleAt(l, item, course, global);
    if (r) return r;
  }
  return "track";
}

export function resolveState(item: RuleItem, course: CourseData, global: GlobalData): ItemState {
  if (effectiveRule("item", item, course, global) === "ignore") return "ignored";
  return course.done.includes(item.cmid) ? "done" : "open";
}

/** The value currently in effect at a layer. The menu offers the opposite. */
export function menuState(layer: Layer, item: RuleItem, course: CourseData, global: GlobalData): Rule {
  return effectiveRule(layer, item, course, global);
}

/**
 * Sets the rule at `layer` to `value`. If the layers below already resolve to
 * `value`, the rule at `layer` is removed instead, so rules do not pile up.
 * Returns new objects; inputs are not mutated.
 */
export function applyMenuAction(
  layer: Layer,
  value: Rule,
  item: RuleItem,
  course: CourseData,
  global: GlobalData,
): { course: CourseData; global: GlobalData } {
  const below = LAYERS[LAYERS.indexOf(layer) + 1];
  const inherited = below ? effectiveRule(below, item, course, global) : "track";

  const nextCourse: CourseData = {
    ...course,
    itemOverrides: { ...course.itemOverrides },
    typeRules: { ...course.typeRules },
  };
  const nextGlobal: GlobalData = { typeRules: { ...global.typeRules } };

  const target =
    layer === "item" ? nextCourse.itemOverrides : layer === "course" ? nextCourse.typeRules : nextGlobal.typeRules;
  const key = layer === "item" ? String(item.cmid) : item.type;

  if (inherited === value) delete target[key];
  else target[key] = value;

  return { course: nextCourse, global: nextGlobal };
}

export function toggleDone(course: CourseData, cmid: number, done: boolean): CourseData {
  const set = new Set(course.done);
  if (done) set.add(cmid);
  else set.delete(cmid);
  return { ...course, done: [...set].sort((a, b) => a - b) };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/model/rules.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/rules.ts tests/model/rules.test.ts
git commit -m "feat: layered ignore rules with menu state and rule removal" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Progress counts

**Files:**
- Create: `tests/model/progress.test.ts`, `src/model/progress.ts`

- [ ] **Step 1: Write the failing tests**

`tests/model/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeProgress } from "../../src/model/progress";
import { DEFAULT_GLOBAL, emptyCourse, type SeenCache } from "../../src/types";

const seen: SeenCache = {
  "1": { section: 0, type: "forum" },
  "2": { section: 1, type: "resource" },
  "3": { section: 1, type: "lti" },
  "4": { section: 2, type: "resource" },
  "5": { section: 2, type: "resource" },
  "6": { section: 2, type: "choice" },
};

describe("computeProgress", () => {
  it("counts tracked items per section and for the course, skipping ignored types", () => {
    const p = computeProgress(seen, { ...emptyCourse(), done: [2, 4] }, DEFAULT_GLOBAL);
    expect(p.course).toEqual({ done: 2, total: 4 });
    expect(p.sections.get(0)).toBeUndefined();
    expect(p.sections.get(1)).toEqual({ done: 1, total: 2 });
    expect(p.sections.get(2)).toEqual({ done: 1, total: 2 });
  });

  it("ignores done cmids that are not in the seen cache", () => {
    const p = computeProgress(seen, { ...emptyCourse(), done: [2, 999] }, DEFAULT_GLOBAL);
    expect(p.course).toEqual({ done: 1, total: 4 });
  });

  it("honours item overrides", () => {
    const course = { ...emptyCourse(), done: [1], itemOverrides: { "1": "track" as const, "2": "ignore" as const } };
    const p = computeProgress(seen, course, DEFAULT_GLOBAL);
    expect(p.sections.get(0)).toEqual({ done: 1, total: 1 });
    expect(p.sections.get(1)).toEqual({ done: 0, total: 1 });
    expect(p.course).toEqual({ done: 1, total: 4 });
  });

  it("returns zero totals for an empty cache", () => {
    const p = computeProgress({}, emptyCourse(), DEFAULT_GLOBAL);
    expect(p.course).toEqual({ done: 0, total: 0 });
    expect(p.sections.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/model/progress.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/model/progress.ts`**

```ts
import type { CourseData, GlobalData, SeenCache } from "../types";
import { resolveState } from "./rules";

export interface Progress {
  done: number;
  total: number;
}

export interface CourseProgress {
  course: Progress;
  /** Keyed by section number. Sections with no tracked items are absent. */
  sections: Map<number, Progress>;
}

export function computeProgress(seen: SeenCache, course: CourseData, global: GlobalData): CourseProgress {
  const sections = new Map<number, Progress>();
  const total: Progress = { done: 0, total: 0 };
  for (const [key, info] of Object.entries(seen)) {
    const state = resolveState({ cmid: Number(key), type: info.type }, course, global);
    if (state === "ignored") continue;
    const section = sections.get(info.section) ?? { done: 0, total: 0 };
    section.total += 1;
    total.total += 1;
    if (state === "done") {
      section.done += 1;
      total.done += 1;
    }
    sections.set(info.section, section);
  }
  return { course: total, sections };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/model/progress.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/progress.ts tests/model/progress.test.ts
git commit -m "feat: compute per-section and course progress from the seen cache" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Storage store

**Files:**
- Create: `tests/storage/store.test.ts`, `src/storage/store.ts`

Uses `storage` from `wxt/utils/storage`. Keys are `sync:global`, `sync:course:<id>`, `local:seen:<id>`. `fakeBrowser` (reset in `tests/setup.ts`) backs it in tests.

- [ ] **Step 1: Write the failing tests**

`tests/storage/store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { storage } from "wxt/utils/storage";
import {
  getCourse, getGlobal, getSeen, listCourses, listSeenTypes, mergeSeenSections, removeCourse,
  resetCourseRules, setSeen, updateCourse, updateGlobal, watchCourse, watchGlobal,
} from "../../src/storage/store";
import { DEFAULT_GLOBAL, emptyCourse } from "../../src/types";

describe("store", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await getGlobal()).toEqual(DEFAULT_GLOBAL);
    expect(await getCourse(7)).toEqual(emptyCourse());
    expect(await getSeen(7)).toEqual({});
  });

  it("updates read-modify-write and persists", async () => {
    await updateCourse(7, (c) => ({ ...c, name: "Nano", done: [1] }));
    await updateCourse(7, (c) => ({ ...c, done: [...c.done, 2] }));
    expect(await getCourse(7)).toEqual({ ...emptyCourse(), name: "Nano", done: [1, 2] });
    expect(await storage.getItem("sync:course:7")).toEqual({ ...emptyCourse(), name: "Nano", done: [1, 2] });

    await updateGlobal((g) => ({ typeRules: { ...g.typeRules, url: "ignore" } }));
    expect((await getGlobal()).typeRules).toEqual({ forum: "ignore", choice: "ignore", url: "ignore" });
  });

  it("replaces the seen cache wholesale with setSeen", async () => {
    await setSeen(7, { "1": { section: 0, type: "forum" } });
    await setSeen(7, { "2": { section: 1, type: "resource" } });
    expect(await getSeen(7)).toEqual({ "2": { section: 1, type: "resource" } });
  });

  it("mergeSeenSections replaces only the given sections", async () => {
    await setSeen(7, {
      "1": { section: 0, type: "forum" },
      "2": { section: 1, type: "resource" },
      "3": { section: 1, type: "resource" },
    });
    const next = await mergeSeenSections(7, [1], [{ cmid: 3, type: "resource", section: 1 }, { cmid: 4, type: "lti", section: 1 }]);
    expect(next).toEqual({
      "1": { section: 0, type: "forum" },
      "3": { section: 1, type: "resource" },
      "4": { section: 1, type: "lti" },
    });
    expect(await getSeen(7)).toEqual(next);
  });

  it("watches course and global changes", async () => {
    const onCourse = vi.fn();
    const onGlobal = vi.fn();
    const stop1 = watchCourse(7, onCourse);
    const stop2 = watchGlobal(onGlobal);
    await updateCourse(7, (c) => ({ ...c, done: [5] }));
    await updateGlobal((g) => ({ typeRules: { ...g.typeRules, url: "ignore" } }));
    expect(onCourse).toHaveBeenCalledWith(expect.objectContaining({ done: [5] }));
    expect(onGlobal).toHaveBeenCalledWith(expect.objectContaining({ typeRules: expect.objectContaining({ url: "ignore" }) }));
    stop1();
    stop2();
  });

  it("lists courses and seen types for the options page", async () => {
    await updateCourse(7, (c) => ({ ...c, name: "Nano" }));
    await updateCourse(8, (c) => ({ ...c, typeRules: { h5pactivity: "ignore" } }));
    await setSeen(7, { "1": { section: 0, type: "forum" }, "2": { section: 1, type: "lti" } });
    const courses = await listCourses();
    expect(courses.map((c) => c.id).sort()).toEqual([7, 8]);
    expect(courses.find((c) => c.id === 7)?.data.name).toBe("Nano");
    expect((await listSeenTypes()).sort()).toEqual(["forum", "h5pactivity", "lti"]);
  });

  it("resetCourseRules keeps checkmarks, removeCourse removes everything", async () => {
    await updateCourse(7, (c) => ({ ...c, name: "Nano", done: [1], itemOverrides: { "1": "ignore" }, typeRules: { url: "ignore" } }));
    await setSeen(7, { "1": { section: 0, type: "forum" } });
    await resetCourseRules(7);
    expect(await getCourse(7)).toEqual({ ...emptyCourse(), name: "Nano", done: [1] });
    await removeCourse(7);
    expect(await getCourse(7)).toEqual(emptyCourse());
    expect(await getSeen(7)).toEqual({});
    expect(await listCourses()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/storage/store.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/storage/store.ts`**

```ts
import { storage, type StorageItemKey } from "wxt/utils/storage";
import { DEFAULT_GLOBAL, emptyCourse, type CourseData, type GlobalData, type SeenCache } from "../types";

const GLOBAL_KEY = "sync:global" as const;
const COURSE_PREFIX = "course:";
const SEEN_PREFIX = "seen:";

const courseKey = (id: number): StorageItemKey => `sync:${COURSE_PREFIX}${id}`;
const seenKey = (id: number): StorageItemKey => `local:${SEEN_PREFIX}${id}`;

export interface SeenInput {
  cmid: number;
  type: string;
  section: number;
}

export async function getGlobal(): Promise<GlobalData> {
  return (await storage.getItem<GlobalData>(GLOBAL_KEY)) ?? DEFAULT_GLOBAL;
}

export async function updateGlobal(fn: (g: GlobalData) => GlobalData): Promise<GlobalData> {
  const next = fn(await getGlobal());
  await storage.setItem(GLOBAL_KEY, next);
  return next;
}

export async function getCourse(id: number): Promise<CourseData> {
  return (await storage.getItem<CourseData>(courseKey(id))) ?? emptyCourse();
}

export async function updateCourse(id: number, fn: (c: CourseData) => CourseData): Promise<CourseData> {
  const next = fn(await getCourse(id));
  await storage.setItem(courseKey(id), next);
  return next;
}

export async function getSeen(id: number): Promise<SeenCache> {
  return (await storage.getItem<SeenCache>(seenKey(id))) ?? {};
}

export async function setSeen(id: number, seen: SeenCache): Promise<void> {
  await storage.setItem(seenKey(id), seen);
}

/** Fallback mode: replace the cached entries of `sectionNums` with `items`, keep other sections. */
export async function mergeSeenSections(id: number, sectionNums: number[], items: SeenInput[]): Promise<SeenCache> {
  const current = await getSeen(id);
  const replaced = new Set(sectionNums);
  const next: SeenCache = {};
  for (const [key, info] of Object.entries(current)) {
    if (!replaced.has(info.section)) next[key] = info;
  }
  for (const item of items) next[String(item.cmid)] = { section: item.section, type: item.type };
  await setSeen(id, next);
  return next;
}

export function watchGlobal(cb: (g: GlobalData) => void): () => void {
  return storage.watch<GlobalData>(GLOBAL_KEY, (value) => cb(value ?? DEFAULT_GLOBAL));
}

export function watchCourse(id: number, cb: (c: CourseData) => void): () => void {
  return storage.watch<CourseData>(courseKey(id), (value) => cb(value ?? emptyCourse()));
}

export async function listCourses(): Promise<Array<{ id: number; data: CourseData }>> {
  const all = await storage.snapshot("sync");
  const result: Array<{ id: number; data: CourseData }> = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(COURSE_PREFIX)) continue;
    const id = Number(key.slice(COURSE_PREFIX.length));
    if (Number.isFinite(id) && value) result.push({ id, data: value as CourseData });
  }
  return result;
}

/** Every module type that appears in any seen cache or any stored rule. */
export async function listSeenTypes(): Promise<string[]> {
  const types = new Set<string>();
  const local = await storage.snapshot("local");
  for (const [key, value] of Object.entries(local)) {
    if (!key.startsWith(SEEN_PREFIX) || !value) continue;
    for (const info of Object.values(value as SeenCache)) types.add(info.type);
  }
  for (const t of Object.keys((await getGlobal()).typeRules)) types.add(t);
  for (const { data } of await listCourses()) for (const t of Object.keys(data.typeRules)) types.add(t);
  return [...types];
}

export async function resetCourseRules(id: number): Promise<void> {
  await updateCourse(id, (c) => ({ ...c, itemOverrides: {}, typeRules: {} }));
}

export async function removeCourse(id: number): Promise<void> {
  await storage.removeItem(courseKey(id));
  await storage.removeItem(seenKey(id));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/storage/store.test.ts`
Expected: 7 tests pass. If `storage.snapshot` returns keys with the area prefix (e.g. `sync:course:7`), strip it: `key.replace(/^(sync|local):/, "")` before the prefix check. Check with a quick `console.log(await storage.snapshot("sync"))` in the test, then remove the log.

- [ ] **Step 5: Commit**

```bash
git add src/storage/store.ts tests/storage/store.test.ts
git commit -m "feat: typed storage store for global, course and seen cache data" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Course state service

**Files:**
- Create: `tests/moodle/state.test.ts`, `src/moodle/state.ts`

Before starting, check whether `examples/course-state-125111.json` exists (Task 0). If it does, open it with the Step 2 command from Task 0 and adjust the field names in both files below to match. If it does not, implement against the spec's assumed names and leave a `TODO(spike)` comment at the top of `state.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/moodle/state.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCourseState, parseCourseState, STATE_TIMEOUT_MS } from "../../src/moodle/state";

/** Builds a service response in the double-encoded shape Moodle returns. */
function response(state: unknown) {
  return [{ error: false, data: JSON.stringify(state) }];
}

const sampleState = {
  course: { id: 42 },
  section: [
    { id: 100, number: 0 },
    { id: 101, number: 1 },
    { id: 150, number: 5, component: "mod_subsection", itemid: 9 },
  ],
  cm: [
    { id: 1, module: "forum", sectionid: 100 },
    { id: 2, module: "label", sectionid: 101 },
    { id: 3, module: "resource", sectionid: 101 },
    { id: 9, module: "subsection", sectionid: 101 },
    { id: 4, module: "url", sectionid: 150 },
    { id: 5, module: "resource", sectionid: 101, uservisible: false },
  ],
};

describe("parseCourseState", () => {
  it("maps cms to the seen-cache shape, dropping labels, subsections and invisible cms", () => {
    expect(parseCourseState(response(sampleState))).toEqual({
      "1": { section: 0, type: "forum" },
      "3": { section: 1, type: "resource" },
      "4": { section: 1, type: "url" },
    });
  });

  it("returns null on error responses and malformed input", () => {
    expect(parseCourseState([{ error: true, exception: { message: "nope" } }])).toBeNull();
    expect(parseCourseState([{ error: false, data: "not json" }])).toBeNull();
    expect(parseCourseState([{ error: false, data: JSON.stringify({ cm: "x" }) }])).toBeNull();
    expect(parseCourseState(null)).toBeNull();
    expect(parseCourseState("")).toBeNull();
  });

  const spikeFile = join(__dirname, "..", "..", "examples", "course-state-125111.json");
  it.skipIf(!existsSync(spikeFile))("parses the real TUM response for course 125111", () => {
    const seen = parseCourseState(JSON.parse(readFileSync(spikeFile, "utf8")));
    expect(seen).not.toBeNull();
    const entries = Object.values(seen!);
    expect(entries.length).toBeGreaterThan(10);
    // Items known from the saved onetopic pages: Problem sheet 1 (section 4), Fluid Properties recording (section 6).
    expect(seen!["3957904"]).toEqual({ section: 4, type: "resource" });
    expect(seen!["3957930"]).toEqual({ section: 6, type: "lti" });
    expect(entries.some((e) => e.type === "label")).toBe(false);
  });
});

describe("fetchCourseState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns null without a sesskey and does not call fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchCourseState(42, null, "https://www.moodle.tum.de")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the expected request and parses the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response(sampleState)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const seen = await fetchCourseState(42, "abc", "https://www.moodle.tum.de");
    expect(seen).toEqual(parseCourseState(response(sampleState)));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.moodle.tum.de/lib/ajax/service.php?sesskey=abc&info=core_courseformat_get_state");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual([
      { index: 0, methodname: "core_courseformat_get_state", args: { courseid: 42 } },
    ]);
  });

  it("returns null on non-200 and on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    expect(await fetchCourseState(42, "abc", "https://x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await fetchCourseState(42, "abc", "https://x")).toBeNull();
  });

  it("aborts after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    ));
    const pending = fetchCourseState(42, "abc", "https://x");
    await vi.advanceTimersByTimeAsync(STATE_TIMEOUT_MS + 1);
    expect(await pending).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/moodle/state.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/moodle/state.ts`**

```ts
import type { SeenCache } from "../types";

export const STATE_TIMEOUT_MS = 10_000;

const SKIPPED_MODULES = new Set(["label", "subsection"]);

interface RawCm {
  id: number;
  module: string;
  sectionid: number;
  uservisible?: boolean;
}

interface RawSection {
  id: number;
  number: number;
  /** Set on delegated sections (e.g. "mod_subsection"). */
  component?: string | null;
  /** For delegated sections: the cmid of the owning subsection activity. */
  itemid?: number | null;
}

interface RawState {
  cm: RawCm[];
  section: RawSection[];
}

/**
 * Converts a core_courseformat_get_state response into the seen-cache shape.
 * Returns null for error responses or anything that does not look like a state.
 */
export function parseCourseState(body: unknown): SeenCache | null {
  try {
    const first = Array.isArray(body) ? body[0] : body;
    if (!first || typeof first !== "object" || (first as { error?: unknown }).error) return null;
    const raw = (first as { data?: unknown }).data;
    const state = (typeof raw === "string" ? JSON.parse(raw) : raw) as RawState | undefined;
    if (!state || !Array.isArray(state.cm) || !Array.isArray(state.section)) return null;

    const sectionById = new Map(state.section.map((s) => [s.id, s]));
    const cmById = new Map(state.cm.map((c) => [c.id, c]));

    /** Section number of the top-level section that (transitively) contains `sectionId`. */
    const topLevelNumber = (sectionId: number, depth = 0): number | null => {
      const section = sectionById.get(sectionId);
      if (!section) return null;
      if (section.component && section.itemid != null && depth < 5) {
        const owner = cmById.get(section.itemid);
        if (owner) return topLevelNumber(owner.sectionid, depth + 1);
      }
      return typeof section.number === "number" ? section.number : null;
    };

    const seen: SeenCache = {};
    for (const cm of state.cm) {
      if (typeof cm.id !== "number" || typeof cm.module !== "string") continue;
      if (SKIPPED_MODULES.has(cm.module) || cm.uservisible === false) continue;
      const section = topLevelNumber(cm.sectionid);
      if (section === null) continue;
      seen[String(cm.id)] = { section, type: cm.module };
    }
    return seen;
  } catch {
    return null;
  }
}

/**
 * Calls Moodle's course state service. Returns null on any failure so the
 * caller can fall back to page parsing. Never throws.
 */
export async function fetchCourseState(
  courseId: number,
  sesskey: string | null,
  origin: string = location.origin,
): Promise<SeenCache | null> {
  if (!sesskey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATE_TIMEOUT_MS);
  try {
    const url = `${origin}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=core_courseformat_get_state`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ index: 0, methodname: "core_courseformat_get_state", args: { courseid: courseId } }]),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseCourseState(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/moodle/state.test.ts`
Expected: all pass (the real-response test is skipped if the spike file is missing). If the spike file exists and the real-response test fails, print `Object.keys(cm[0])` and `Object.keys(section[0])` from the file and adapt `RawCm`/`RawSection` and the mapping, then update the spec's field list.

- [ ] **Step 5: Commit**

```bash
git add src/moodle/state.ts tests/moodle/state.test.ts
git commit -m "feat: fetch and parse Moodle course state into the seen cache" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: UI rendering

**Files:**
- Create: `src/ui/styles.css`, `src/ui/render.ts`, `tests/ui/render.test.ts`

Design: `render(doc, model)` is idempotent and owns all DOM mutation. `installHandlers(doc, handlers)` attaches one delegated listener set to the document and reads `data-*` attributes, so re-rendering never re-binds events. All injected elements have class `mtd-*`.

Insertion points (from the example markup):
- Checkbox: first child of `li.activity .activity-grid` (fallback: first child of the `li`).
- Menu button and menu: appended to `.activity-grid` (same fallback).
- Section badge: inside `[data-region="sectionbadges"]` of the section if present, otherwise right after `headingEl`.
- Tab badge: appended inside the tab's `a.nav-link`.
- Progress bar: inserted before `div.course-content` (fallback: before the first `li.section`'s closest `ul`).

- [ ] **Step 1: Write the failing tests**

`tests/ui/render.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeProgress } from "../../src/model/progress";
import { parsePage } from "../../src/parse/page";
import { installHandlers, render, type RenderModel } from "../../src/ui/render";
import { DEFAULT_GLOBAL, emptyCourse, type ParsedPage, type SeenCache } from "../../src/types";
import { loadPage } from "../fixtures";

function seenFromPage(page: ParsedPage): SeenCache {
  const seen: SeenCache = {};
  for (const s of page.sections) for (const i of s.items) seen[String(i.cmid)] = { section: s.num, type: i.type };
  return seen;
}

function model(page: ParsedPage, overrides: Partial<RenderModel> = {}): RenderModel {
  const course = overrides.course ?? emptyCourse();
  const global = overrides.global ?? DEFAULT_GLOBAL;
  return {
    page,
    course,
    global,
    progress: computeProgress(seenFromPage(page), course, global),
    fallback: false,
    message: null,
    ...overrides,
  };
}

describe("render on a weeks course (Nanotechnologie)", () => {
  let doc: Document;
  let page: ParsedPage;
  beforeEach(() => {
    doc = loadPage("nano");
    page = parsePage(doc)!;
  });

  it("adds one checkbox per tracked item and none for ignored items, idempotently", () => {
    render(doc, model(page));
    render(doc, model(page));
    // 10 items, forum and choice ignored by default: 8 checkboxes
    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(8);
    expect(doc.querySelectorAll(".mtd-menu-btn")).toHaveLength(10);
    expect(doc.querySelectorAll("li.activity.mtd-ignored")).toHaveLength(2);
    expect(doc.querySelectorAll(".mtd-progress")).toHaveLength(1);
  });

  it("reflects done state and section badges", () => {
    const course = { ...emptyCourse(), done: [3979856] }; // 01_Introduction_Lithography, section 1
    render(doc, model(page, { course }));
    const li = doc.getElementById("module-3979856")!;
    expect(li.classList.contains("mtd-done")).toBe(true);
    expect(li.querySelector<HTMLInputElement>(".mtd-checkbox")!.checked).toBe(true);
    const badge1 = page.sections[1]!.headingEl!.closest("li.section")!.querySelector(".mtd-badge")!;
    expect(badge1.textContent).toBe("1/2");
    expect(badge1.classList.contains("mtd-complete")).toBe(false);
    // section 0 holds only the announcements forum, which is ignored: no badge
    expect(page.sections[0]!.headingEl!.closest("li.section")!.querySelector(".mtd-badge")).toBeNull();
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("1 / 8 done");
  });

  it("marks a section complete and removes a badge that becomes empty", () => {
    const course = { ...emptyCourse(), done: [3979856, 3985853] };
    render(doc, model(page, { course }));
    const section1 = page.sections[1]!.headingEl!.closest("li.section")!;
    expect(section1.querySelector(".mtd-badge")!.classList.contains("mtd-complete")).toBe(true);
    expect(section1.querySelector(".mtd-badge")!.textContent).toBe("✓ 2/2");
    // Ignoring files and recordings at course level leaves nothing tracked (forum and choice are ignored globally).
    const ignored = { ...course, typeRules: { resource: "ignore" as const, lti: "ignore" as const } };
    render(doc, model(page, { course: ignored }));
    expect(section1.querySelector(".mtd-badge")).toBeNull();
    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(0);
  });

  it("shows fallback note and messages", () => {
    render(doc, model(page, { fallback: true, message: "Could not save" }));
    const bar = doc.querySelector(".mtd-progress")!;
    expect(bar.textContent).toContain("Course state unavailable");
    expect(bar.textContent).toContain("Could not save");
    render(doc, model(page));
    expect(doc.querySelector(".mtd-progress")!.textContent).not.toContain("unavailable");
  });

  it("renders without progress (before the state call returns)", () => {
    render(doc, model(page, { progress: null }));
    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(8);
    expect(doc.querySelectorAll(".mtd-badge")).toHaveLength(0);
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("Loading…");
  });

  it("dispatches checkbox and menu actions through installed handlers", () => {
    const onToggleDone = vi.fn();
    const onMenuAction = vi.fn();
    installHandlers(doc, { onToggleDone, onMenuAction });
    render(doc, model(page));

    const li = doc.getElementById("module-3979856")!;
    const box = li.querySelector<HTMLInputElement>(".mtd-checkbox")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onToggleDone).toHaveBeenCalledWith(3979856, true);

    li.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.click();
    expect(li.querySelector(".mtd-menu")!.classList.contains("mtd-open")).toBe(true);
    const labels = Array.from(li.querySelectorAll(".mtd-menu-item")).map((b) => b.textContent);
    expect(labels).toEqual(["Ignore this item", "Ignore all File in this course", "Ignore all File everywhere"]);
    li.querySelectorAll<HTMLButtonElement>(".mtd-menu-item")[1]!.click();
    expect(onMenuAction).toHaveBeenCalledWith("course", "ignore", { cmid: 3979856, type: "resource" });
    expect(li.querySelector(".mtd-menu")!.classList.contains("mtd-open")).toBe(false);
  });

  it("offers Track labels for an ignored item and keeps its menu usable", () => {
    installHandlers(doc, { onToggleDone: vi.fn(), onMenuAction: vi.fn() });
    render(doc, model(page));
    const forum = doc.getElementById("module-3828430")!; // Ankündigungen
    expect(forum.querySelector(".mtd-checkbox")).toBeNull();
    forum.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.click();
    const labels = Array.from(forum.querySelectorAll(".mtd-menu-item")).map((b) => b.textContent);
    expect(labels).toEqual(["Track this item", "Track all Forum in this course", "Track all Forum everywhere"]);
  });
});

describe("render on a onetopic course (Thermodynamics, Oct 27 tab)", () => {
  it("puts badges on tabs from the full seen cache", () => {
    const doc = loadPage("thermoOct27");
    const page = parsePage(doc)!;
    const seen: SeenCache = {
      ...seenFromPage(page),
      "3957904": { section: 4, type: "resource" },
      "3957910": { section: 4, type: "resource" },
    };
    const course = { ...emptyCourse(), done: [3957904, 3957930] };
    render(doc, { page, course, global: DEFAULT_GLOBAL, progress: computeProgress(seen, course, DEFAULT_GLOBAL), fallback: false, message: null });
    const tab4 = page.tabs!.find((t) => t.num === 4)!.el;
    const tab6 = page.tabs!.find((t) => t.num === 6)!.el;
    const tab0 = page.tabs!.find((t) => t.num === 0)!.el;
    expect(tab4.querySelector(".mtd-badge")!.textContent).toBe("1/2");
    expect(tab6.querySelector(".mtd-badge")!.textContent).toBe("1/7");
    expect(tab0.querySelector(".mtd-badge")).toBeNull();
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("2 / 9 done");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/render.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Create `src/ui/styles.css`**

```css
/* Moodle Todo: all selectors are prefixed mtd- to stay clear of Moodle's CSS. */

.mtd-check {
  display: flex;
  align-items: center;
  margin-right: 0.6rem;
  position: relative;
  z-index: 2; /* above Moodle's stretched-link overlay */
}

.mtd-checkbox {
  width: 1.15rem;
  height: 1.15rem;
  cursor: pointer;
  accent-color: #0065bd; /* TUM blue */
}

li.activity.mtd-done .activity-name-area {
  opacity: 0.55;
}

li.activity.mtd-done .instancename {
  text-decoration: line-through;
}

li.activity.mtd-ignored .activity-grid > :not(.mtd-menu-wrap) {
  opacity: 0.35;
}

.mtd-menu-wrap {
  position: relative;
  margin-left: auto;
  align-self: center;
  z-index: 3;
}

.mtd-menu-btn {
  border: 0;
  background: transparent;
  color: #6a6a6a;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

li.activity:hover .mtd-menu-btn,
.mtd-menu-btn:focus-visible,
.mtd-menu.mtd-open + .mtd-menu-btn,
.mtd-menu-wrap:focus-within .mtd-menu-btn {
  opacity: 1;
}

.mtd-menu-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.mtd-menu {
  display: none;
  position: absolute;
  right: 0;
  top: 100%;
  min-width: 15rem;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  padding: 0.25rem;
  z-index: 1000;
}

.mtd-menu.mtd-open {
  display: block;
}

.mtd-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.45rem 0.7rem;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}

.mtd-menu-item:hover {
  background: #f0f4f8;
}

.mtd-badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  background: #e9ecef;
  color: #333;
  vertical-align: middle;
}

.mtd-badge.mtd-complete {
  background: #d4edda;
  color: #155724;
}

.mtd-progress {
  margin: 0 0 1rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  background: #fafbfc;
  font-size: 0.9rem;
}

.mtd-progress-text {
  font-weight: 600;
}

.mtd-progress-track {
  height: 6px;
  margin-top: 0.4rem;
  border-radius: 3px;
  background: #e3e7eb;
  overflow: hidden;
}

.mtd-progress-fill {
  height: 100%;
  background: #0065bd;
  transition: width 0.2s;
}

.mtd-progress-note {
  margin-top: 0.3rem;
  color: #6a6a6a;
  font-size: 0.8rem;
}

.mtd-progress-message {
  margin-top: 0.3rem;
  color: #a12622;
  font-size: 0.8rem;
}
```

- [ ] **Step 4: Implement `src/ui/render.ts`**

```ts
import type { CourseProgress, Progress } from "../model/progress";
import { menuState, resolveState } from "../model/rules";
import { typeName } from "../model/typeNames";
import type { CourseData, GlobalData, Layer, ParsedItem, ParsedPage, Rule, RuleItem } from "../types";

export interface RenderModel {
  page: ParsedPage;
  course: CourseData;
  global: GlobalData;
  /** null until the seen cache is ready; badges and the bar then show a loading state. */
  progress: CourseProgress | null;
  fallback: boolean;
  message: string | null;
}

export interface Handlers {
  onToggleDone(cmid: number, done: boolean): void;
  onMenuAction(layer: Layer, value: Rule, item: RuleItem): void;
}

const FALLBACK_NOTE = "Course state unavailable, counts may be incomplete";
const LAYERS: Layer[] = ["item", "course", "global"];

/** Renders the whole page from the model. Safe to call repeatedly. */
export function render(doc: Document, model: RenderModel): void {
  for (const section of model.page.sections) {
    for (const item of section.items) renderItem(doc, item, model);
    renderSectionBadge(doc, section.headingEl, model.progress?.sections.get(section.num));
  }
  for (const tab of model.page.tabs ?? []) {
    renderBadge(doc, tab.el, null, model.progress?.sections.get(tab.num));
  }
  renderProgressBar(doc, model);
}

/** Installs delegated event handlers once per document. */
export function installHandlers(doc: Document, handlers: Handlers): void {
  doc.addEventListener("change", (e) => {
    const box = (e.target as Element | null)?.closest<HTMLInputElement>(".mtd-checkbox");
    if (!box) return;
    handlers.onToggleDone(Number(box.dataset.cmid), box.checked);
  });

  doc.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    const menuBtn = target?.closest<HTMLButtonElement>(".mtd-menu-btn");
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();
      const menu = menuBtn.parentElement?.querySelector(".mtd-menu");
      const wasOpen = menu?.classList.contains("mtd-open") ?? false;
      closeAllMenus(doc);
      if (!wasOpen) menu?.classList.add("mtd-open");
      return;
    }
    const menuItem = target?.closest<HTMLButtonElement>(".mtd-menu-item");
    if (menuItem) {
      e.preventDefault();
      e.stopPropagation();
      const wrap = menuItem.closest<HTMLElement>(".mtd-menu-wrap")!;
      handlers.onMenuAction(
        menuItem.dataset.layer as Layer,
        menuItem.dataset.value as Rule,
        { cmid: Number(wrap.dataset.cmid), type: wrap.dataset.type ?? "" },
      );
      closeAllMenus(doc);
      return;
    }
    closeAllMenus(doc);
  });
}

function closeAllMenus(doc: Document): void {
  doc.querySelectorAll(".mtd-menu.mtd-open").forEach((m) => m.classList.remove("mtd-open"));
}

function renderItem(doc: Document, item: ParsedItem, model: RenderModel): void {
  const state = resolveState(item, model.course, model.global);
  const host = item.el.querySelector<HTMLElement>(".activity-grid") ?? item.el;

  item.el.classList.toggle("mtd-done", state === "done");
  item.el.classList.toggle("mtd-ignored", state === "ignored");

  let check = host.querySelector<HTMLElement>(":scope > .mtd-check");
  if (state === "ignored") {
    check?.remove();
  } else {
    if (!check) {
      check = doc.createElement("span");
      check.className = "mtd-check";
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.className = "mtd-checkbox";
      box.dataset.cmid = String(item.cmid);
      box.title = "Mark as done";
      check.appendChild(box);
      host.insertBefore(check, host.firstChild);
    }
    check.querySelector<HTMLInputElement>(".mtd-checkbox")!.checked = state === "done";
  }

  let wrap = host.querySelector<HTMLElement>(":scope > .mtd-menu-wrap");
  if (!wrap) {
    wrap = doc.createElement("span");
    wrap.className = "mtd-menu-wrap";
    const menu = doc.createElement("div");
    menu.className = "mtd-menu";
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "mtd-menu-btn";
    btn.title = "Ignore options";
    btn.setAttribute("aria-label", "Ignore options");
    btn.textContent = "⋯";
    wrap.append(menu, btn);
    host.appendChild(wrap);
  }
  wrap.dataset.cmid = String(item.cmid);
  wrap.dataset.type = item.type;
  renderMenuItems(doc, wrap.querySelector(".mtd-menu")!, item, model);
}

function renderMenuItems(doc: Document, menu: Element, item: RuleItem, model: RenderModel): void {
  const name = typeName(item.type);
  menu.replaceChildren(
    ...LAYERS.map((layer) => {
      const current = menuState(layer, item, model.course, model.global);
      const value: Rule = current === "ignore" ? "track" : "ignore";
      const verb = value === "ignore" ? "Ignore" : "Track";
      const label =
        layer === "item" ? `${verb} this item`
        : layer === "course" ? `${verb} all ${name} in this course`
        : `${verb} all ${name} everywhere`;
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "mtd-menu-item";
      btn.dataset.layer = layer;
      btn.dataset.value = value;
      btn.textContent = label;
      return btn;
    }),
  );
}

function renderSectionBadge(doc: Document, headingEl: HTMLElement | null, progress: Progress | undefined): void {
  if (!headingEl) return;
  const section = headingEl.closest<HTMLElement>("li.section");
  const slot = section?.querySelector<HTMLElement>('[data-region="sectionbadges"]') ?? null;
  renderBadge(doc, slot ?? headingEl, slot ? null : headingEl, progress);
}

/**
 * Keeps exactly one .mtd-badge for `anchor`. If `after` is given the badge is
 * placed right after it, otherwise appended inside `anchor`.
 */
function renderBadge(doc: Document, anchor: HTMLElement, after: HTMLElement | null, progress: Progress | undefined): void {
  const existing = after
    ? (after.nextElementSibling?.classList.contains("mtd-badge") ? (after.nextElementSibling as HTMLElement) : null)
    : anchor.querySelector<HTMLElement>(":scope > .mtd-badge");
  if (!progress || progress.total === 0) {
    existing?.remove();
    return;
  }
  let badge = existing;
  if (!badge) {
    badge = doc.createElement("span");
    badge.className = "mtd-badge";
    if (after) after.insertAdjacentElement("afterend", badge);
    else anchor.appendChild(badge);
  }
  const complete = progress.done === progress.total;
  badge.textContent = `${complete ? "✓ " : ""}${progress.done}/${progress.total}`;
  badge.classList.toggle("mtd-complete", complete);
  badge.title = complete ? "Section complete" : `${progress.done} of ${progress.total} done`;
}

function renderProgressBar(doc: Document, model: RenderModel): void {
  let bar = doc.querySelector<HTMLElement>(".mtd-progress");
  if (!bar) {
    const content = doc.querySelector(".course-content") ?? doc.querySelector('li.section[data-for="section"]')?.closest("ul") ?? null;
    if (!content?.parentElement) return;
    bar = doc.createElement("div");
    bar.className = "mtd-progress";
    bar.innerHTML =
      '<div class="mtd-progress-text"></div>' +
      '<div class="mtd-progress-track"><div class="mtd-progress-fill"></div></div>' +
      '<div class="mtd-progress-note"></div>' +
      '<div class="mtd-progress-message"></div>';
    content.parentElement.insertBefore(bar, content);
  }
  const text = bar.querySelector<HTMLElement>(".mtd-progress-text")!;
  const fill = bar.querySelector<HTMLElement>(".mtd-progress-fill")!;
  const note = bar.querySelector<HTMLElement>(".mtd-progress-note")!;
  const message = bar.querySelector<HTMLElement>(".mtd-progress-message")!;

  if (!model.progress) {
    text.textContent = "Loading…";
    fill.style.width = "0%";
  } else {
    const { done, total } = model.progress.course;
    text.textContent = `${done} / ${total} done`;
    fill.style.width = total === 0 ? "0%" : `${Math.round((done / total) * 100)}%`;
  }
  note.textContent = model.fallback ? FALLBACK_NOTE : "";
  note.hidden = !model.fallback;
  message.textContent = model.message ?? "";
  message.hidden = !model.message;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ui/render.test.ts`
Expected: all pass. Likely trip points: jsdom supports `:scope` in `querySelector` (it does); `replaceChildren` exists in jsdom 31. If the `"1 / 8 done"` assertion fails, check that `seenFromPage` and `DEFAULT_GLOBAL` give 8 tracked items (10 minus forum minus choice).

- [ ] **Step 6: Commit**

```bash
git add src/ui/styles.css src/ui/render.ts tests/ui/render.test.ts
git commit -m "feat: render checkboxes, ignore menus, badges and progress bar" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: App wiring and content script

**Files:**
- Create: `src/app.ts`, `tests/app.test.ts`
- Modify: `entrypoints/moodle.content.ts`

`App` owns in-memory state, loads storage, kicks off the state fetch, renders, persists user actions optimistically, and re-renders on storage changes.

- [ ] **Step 1: Write the failing tests**

`tests/app.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { App } from "../src/app";
import { parsePage } from "../src/parse/page";
import { getCourse, getGlobal, getSeen, setSeen, updateCourse } from "../src/storage/store";
import { loadPage } from "./fixtures";

function stateResponse(cms: Array<{ id: number; module: string; sectionid: number }>, sections: Array<{ id: number; number: number }>) {
  return new Response(JSON.stringify([{ error: false, data: JSON.stringify({ cm: cms, section: sections }) }]), { status: 200 });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders checkboxes, stores the course name and the seen cache from the state service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => stateResponse(
      [{ id: 3979856, module: "resource", sectionid: 11 }, { id: 3985853, module: "lti", sectionid: 11 }, { id: 777, module: "resource", sectionid: 12 }],
      [{ id: 11, number: 1 }, { id: 12, number: 9 }],
    )));
    const doc = loadPage("nano");
    const page = parsePage(doc)!;
    const app = new App(doc, page, { isCoursePage: true, origin: "https://www.moodle.tum.de" });
    await app.start();

    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(8);
    expect((await getCourse(120985)).name).toBe("Nanotechnologie");
    expect(await getSeen(120985)).toEqual({
      "3979856": { section: 1, type: "resource" },
      "3985853": { section: 1, type: "lti" },
      "777": { section: 9, type: "resource" },
    });
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("0 / 3 done");
    expect(doc.querySelector(".mtd-progress")!.textContent).not.toContain("unavailable");
  });

  it("falls back to page items when the state call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await setSeen(120985, { "555": { section: 15, type: "resource" } });
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    const seen = await getSeen(120985);
    expect(Object.keys(seen)).toHaveLength(10);
    expect(seen["555"]).toBeUndefined(); // section 15 is on the page (all weeks are), so it was replaced
    expect(doc.querySelector(".mtd-progress")!.textContent).toContain("Course state unavailable");
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("0 / 8 done");
  });

  it("does not store the course name from a section page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: false, origin: "https://x" });
    await app.start();
    expect((await getCourse(120985)).name).toBe("");
  });

  it("persists checkbox changes optimistically and reacts to external storage changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    const li = doc.getElementById("module-3979856")!;
    const box = li.querySelector<HTMLInputElement>(".mtd-checkbox")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(li.classList.contains("mtd-done")).toBe(true); // immediate
    await flush();
    expect((await getCourse(120985)).done).toEqual([3979856]);
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("1 / 8 done");

    // another tab marks a second item done
    await updateCourse(120985, (c) => ({ ...c, done: [...c.done, 3985853] }));
    await flush();
    expect(doc.getElementById("module-3985853")!.classList.contains("mtd-done")).toBe(true);
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("2 / 8 done");
  });

  it("reverts the optimistic change and shows a message when the write fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    vi.spyOn(fakeBrowser.storage.sync, "set").mockRejectedValueOnce(new Error("QUOTA_BYTES_PER_ITEM exceeded"));
    const li = doc.getElementById("module-3979856")!;
    const box = li.querySelector<HTMLInputElement>(".mtd-checkbox")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(li.classList.contains("mtd-done")).toBe(true);
    await flush();
    expect(li.classList.contains("mtd-done")).toBe(false);
    expect(box.checked).toBe(false);
    expect(doc.querySelector(".mtd-progress-message")!.textContent).toContain("Could not save");
    expect((await getCourse(120985)).done).toEqual([]);
  });

  it("applies menu actions to the right storage area", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    const li = doc.getElementById("module-3979856")!;
    li.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.click();
    const items = li.querySelectorAll<HTMLButtonElement>(".mtd-menu-item");
    items[2]!.click(); // Ignore all File everywhere
    await flush();
    expect((await getGlobal()).typeRules.resource).toBe("ignore");
    expect(li.classList.contains("mtd-ignored")).toBe(true);
    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(4); // the 4 lti recordings remain

    li.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.click();
    li.querySelectorAll<HTMLButtonElement>(".mtd-menu-item")[1]!.click(); // Track all File in this course
    await flush();
    expect((await getCourse(120985)).typeRules.resource).toBe("track");
    expect(li.classList.contains("mtd-ignored")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/app.test.ts`
Expected: FAIL, cannot find module `../src/app`.

- [ ] **Step 3: Implement `src/app.ts`**

```ts
import { fetchCourseState } from "./moodle/state";
import { computeProgress, type CourseProgress } from "./model/progress";
import { applyMenuAction, toggleDone } from "./model/rules";
import {
  getCourse, getGlobal, mergeSeenSections, setSeen, updateCourse, updateGlobal, watchCourse, watchGlobal,
} from "./storage/store";
import type { CourseData, GlobalData, Layer, ParsedPage, Rule, RuleItem, SeenCache } from "./types";
import { DEFAULT_GLOBAL, emptyCourse } from "./types";
import { installHandlers, render } from "./ui/render";

export interface AppOptions {
  /** True on course/view.php, where the h1 is the course name. */
  isCoursePage: boolean;
  origin: string;
}

const TAG = "[moodle-todo]";

export class App {
  private course: CourseData = emptyCourse();
  private global: GlobalData = DEFAULT_GLOBAL;
  private seen: SeenCache | null = null;
  private fallback = false;
  private message: string | null = null;

  constructor(
    private readonly doc: Document,
    private readonly page: ParsedPage,
    private readonly options: AppOptions,
  ) {}

  async start(): Promise<void> {
    const { courseId } = this.page;
    installHandlers(this.doc, {
      onToggleDone: (cmid, done) => this.handleToggleDone(cmid, done),
      onMenuAction: (layer, value, item) => this.handleMenuAction(layer, value, item),
    });

    [this.global, this.course] = await Promise.all([getGlobal(), getCourse(courseId)]);
    if (this.options.isCoursePage && this.page.courseName && this.course.name !== this.page.courseName) {
      const name = this.page.courseName;
      this.course = await updateCourse(courseId, (c) => ({ ...c, name }));
    }
    this.render();

    watchGlobal((g) => { this.global = g; this.render(); });
    watchCourse(courseId, (c) => { this.course = c; this.render(); });

    await this.loadSeen();
    this.render();
  }

  private async loadSeen(): Promise<void> {
    const { courseId, sesskey, sections } = this.page;
    const state = await fetchCourseState(courseId, sesskey, this.options.origin);
    if (state) {
      this.seen = state;
      this.fallback = false;
      await setSeen(courseId, state);
      return;
    }
    console.warn(`${TAG} course state unavailable, using page items only`);
    this.fallback = true;
    this.seen = await mergeSeenSections(
      courseId,
      sections.map((s) => s.num),
      sections.flatMap((s) => s.items.map((i) => ({ cmid: i.cmid, type: i.type, section: s.num }))),
    );
  }

  private render(): void {
    const progress: CourseProgress | null = this.seen ? computeProgress(this.seen, this.course, this.global) : null;
    render(this.doc, {
      page: this.page,
      course: this.course,
      global: this.global,
      progress,
      fallback: this.fallback,
      message: this.message,
    });
  }

  private handleToggleDone(cmid: number, done: boolean): void {
    this.course = toggleDone(this.course, cmid, done);
    this.message = null;
    this.render();
    updateCourse(this.page.courseId, (c) => toggleDone(c, cmid, done)).catch((err: unknown) => {
      console.warn(`${TAG} could not save`, err);
      this.course = toggleDone(this.course, cmid, !done);
      this.message = "Could not save, please try again";
      this.render();
    });
  }

  private handleMenuAction(layer: Layer, value: Rule, item: RuleItem): void {
    const optimistic = applyMenuAction(layer, value, item, this.course, this.global);
    const previous = { course: this.course, global: this.global };
    this.course = optimistic.course;
    this.global = optimistic.global;
    this.message = null;
    this.render();

    const write =
      layer === "global"
        ? updateGlobal((g) => applyMenuAction(layer, value, item, previous.course, g).global)
        : updateCourse(this.page.courseId, (c) => applyMenuAction(layer, value, item, c, previous.global).course);

    write.catch((err: unknown) => {
      console.warn(`${TAG} could not save`, err);
      this.course = previous.course;
      this.global = previous.global;
      this.message = "Could not save, please try again";
      this.render();
    });
  }
}
```

- [ ] **Step 4: Replace `entrypoints/moodle.content.ts`**

```ts
import { defineContentScript } from "wxt/utils/define-content-script";
import { App } from "../src/app";
import { parsePage } from "../src/parse/page";
import "../src/ui/styles.css";

export default defineContentScript({
  matches: [
    "https://www.moodle.tum.de/course/view.php*",
    "https://www.moodle.tum.de/course/section.php*",
  ],
  runAt: "document_idle",
  async main() {
    const page = parsePage(document);
    if (!page) {
      console.warn("[moodle-todo] not a recognizable course page, doing nothing");
      return;
    }
    const app = new App(document, page, {
      isCoursePage: location.pathname.endsWith("/course/view.php"),
      origin: location.origin,
    });
    await app.start();
  },
});
```

- [ ] **Step 5: Run all tests and the build**

Run: `npm test`
Expected: all test files pass.

Run: `npm run build`
Expected: build succeeds; `.output/chrome-mv3/manifest.json` lists the content script with a `css` entry.

Run: `npm run compile`
Expected: no type errors. Fix any that appear (common: `noUncheckedIndexedAccess` needing `!` or guards).

- [ ] **Step 6: Commit**

```bash
git add src/app.ts tests/app.test.ts entrypoints/moodle.content.ts
git commit -m "feat: wire content script to storage, course state and rendering" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Options page

**Files:**
- Create: `entrypoints/options/index.html`, `entrypoints/options/main.ts`, `entrypoints/options/style.css`, `src/options/view.ts`, `tests/options/view.test.ts`

The page logic lives in `src/options/view.ts` as `renderOptions(root, data, actions)` so it can be tested with jsdom; `main.ts` only loads data and binds store calls.

- [ ] **Step 1: Write the failing test**

`tests/options/view.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { renderOptions, type OptionsActions, type OptionsData } from "../../src/options/view";
import { DEFAULT_GLOBAL, emptyCourse } from "../../src/types";

function data(partial: Partial<OptionsData> = {}): OptionsData {
  return {
    global: DEFAULT_GLOBAL,
    types: ["resource", "forum", "choice", "h5pactivity"],
    courses: [
      { id: 7, data: { ...emptyCourse(), name: "Nano", typeRules: { url: "track" }, itemOverrides: { "1": "ignore", "2": "ignore" } } },
      { id: 8, data: { ...emptyCourse(), done: [1] } },
    ],
    ...partial,
  };
}

function actions(): OptionsActions {
  return { setGlobalType: vi.fn(), resetCourseRules: vi.fn(), removeCourse: vi.fn() };
}

describe("renderOptions", () => {
  it("renders a toggle per type with the current global value", () => {
    const root = document.createElement("div");
    renderOptions(root, data(), actions());
    const selects = root.querySelectorAll<HTMLSelectElement>("select[data-type]");
    expect(Array.from(selects).map((s) => [s.dataset.type, s.value])).toEqual([
      ["resource", "track"], ["forum", "ignore"], ["choice", "ignore"], ["h5pactivity", "track"],
    ]);
    expect(root.textContent).toContain("File");
    expect(root.textContent).toContain("h5pactivity");
  });

  it("calls setGlobalType when a toggle changes", () => {
    const root = document.createElement("div");
    const a = actions();
    renderOptions(root, data(), a);
    const select = root.querySelector<HTMLSelectElement>('select[data-type="resource"]')!;
    select.value = "ignore";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(a.setGlobalType).toHaveBeenCalledWith("resource", "ignore");
  });

  it("lists courses sorted by title, with an id fallback, their rules and override counts", () => {
    const root = document.createElement("div");
    renderOptions(root, data(), actions());
    const cards = root.querySelectorAll(".course");
    expect(cards).toHaveLength(2);
    // "Course 8" sorts before "Nano"
    expect(cards[0]!.querySelector("h3")!.textContent).toBe("Course 8");
    expect(cards[0]!.textContent).toContain("No course rules");
    expect(cards[1]!.querySelector("h3")!.textContent).toBe("Nano");
    expect(cards[1]!.textContent).toContain("Link: track");
    expect(cards[1]!.textContent).toContain("2 item overrides");
  });

  it("confirms before resetting", () => {
    const root = document.createElement("div");
    const a = actions();
    renderOptions(root, data(), a);
    const nano = Array.from(root.querySelectorAll(".course")).find((c) => c.querySelector("h3")!.textContent === "Nano")!;
    const other = Array.from(root.querySelectorAll(".course")).find((c) => c.querySelector("h3")!.textContent === "Course 8")!;
    vi.stubGlobal("confirm", vi.fn(() => false));
    nano.querySelector<HTMLButtonElement>('button[data-action="reset-rules"]')!.click();
    expect(a.resetCourseRules).not.toHaveBeenCalled();
    vi.stubGlobal("confirm", vi.fn(() => true));
    nano.querySelector<HTMLButtonElement>('button[data-action="reset-rules"]')!.click();
    expect(a.resetCourseRules).toHaveBeenCalledWith(7);
    other.querySelector<HTMLButtonElement>('button[data-action="remove"]')!.click();
    expect(a.removeCourse).toHaveBeenCalledWith(8);
    vi.unstubAllGlobals();
  });

  it("shows an empty state", () => {
    const root = document.createElement("div");
    renderOptions(root, data({ courses: [] }), actions());
    expect(root.textContent).toContain("No courses yet");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/options/view.test.ts`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `src/options/view.ts`**

```ts
import { typeName } from "../model/typeNames";
import type { CourseData, GlobalData, Rule } from "../types";

export interface OptionsData {
  global: GlobalData;
  /** All types to show toggles for, already ordered. */
  types: string[];
  courses: Array<{ id: number; data: CourseData }>;
}

export interface OptionsActions {
  setGlobalType(type: string, value: Rule): void;
  resetCourseRules(id: number): void;
  removeCourse(id: number): void;
}

export function renderOptions(root: HTMLElement, data: OptionsData, actions: OptionsActions): void {
  root.replaceChildren();
  const doc = root.ownerDocument;

  const globalSection = el(doc, "section", "global");
  globalSection.append(el(doc, "h2", null, "Global rules"));
  globalSection.append(el(doc, "p", "hint", "Applies to every course unless a course or item rule says otherwise."));
  const list = el(doc, "div", "type-list");
  for (const type of data.types) {
    const row = el(doc, "label", "type-row");
    row.append(el(doc, "span", "type-name", `${typeName(type)}${typeName(type) === type ? "" : ` (${type})`}`));
    const select = doc.createElement("select");
    select.dataset.type = type;
    for (const v of ["track", "ignore"] as Rule[]) {
      const opt = doc.createElement("option");
      opt.value = v;
      opt.textContent = v === "track" ? "Track" : "Ignore";
      select.append(opt);
    }
    select.value = data.global.typeRules[type] ?? "track";
    select.addEventListener("change", () => actions.setGlobalType(type, select.value as Rule));
    row.append(select);
    list.append(row);
  }
  globalSection.append(list);
  root.append(globalSection);

  const coursesSection = el(doc, "section", "courses");
  coursesSection.append(el(doc, "h2", null, "Courses"));
  if (data.courses.length === 0) {
    coursesSection.append(el(doc, "p", "hint", "No courses yet. Open a course on Moodle and check something off."));
  }
  const sorted = [...data.courses].sort((a, b) => courseTitle(a).localeCompare(courseTitle(b)));
  for (const course of sorted) {
    const card = el(doc, "div", "course");
    card.append(el(doc, "h3", null, courseTitle(course)));

    const rules = Object.entries(course.data.typeRules);
    const overrides = Object.keys(course.data.itemOverrides).length;
    const summary = el(doc, "p", "summary");
    summary.textContent =
      (rules.length ? rules.map(([t, v]) => `${typeName(t)}: ${v}`).join(", ") : "No course rules") +
      ` · ${overrides} item override${overrides === 1 ? "" : "s"} · ${course.data.done.length} done`;
    card.append(summary);

    const buttons = el(doc, "div", "buttons");
    const reset = el(doc, "button", null, "Reset rules") as HTMLButtonElement;
    reset.type = "button";
    reset.dataset.action = "reset-rules";
    reset.title = "Removes course and item rules, keeps checkmarks";
    reset.addEventListener("click", () => {
      if (confirm(`Reset all ignore rules for "${courseTitle(course)}"? Checkmarks are kept.`)) actions.resetCourseRules(course.id);
    });
    const remove = el(doc, "button", "danger", "Reset everything") as HTMLButtonElement;
    remove.type = "button";
    remove.dataset.action = "remove";
    remove.title = "Removes rules and all checkmarks for this course";
    remove.addEventListener("click", () => {
      if (confirm(`Delete all rules and checkmarks for "${courseTitle(course)}"? This cannot be undone.`)) actions.removeCourse(course.id);
    });
    buttons.append(reset, remove);
    card.append(buttons);
    coursesSection.append(card);
  }
  root.append(coursesSection);
}

function courseTitle(course: { id: number; data: CourseData }): string {
  return course.data.name || `Course ${course.id}`;
}

function el(doc: Document, tag: string, className: string | null, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/options/view.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Create the options entrypoint**

`entrypoints/options/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="manifest.open_in_tab" content="true" />
    <title>Moodle Todo settings</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main>
      <h1>Moodle Todo</h1>
      <div id="app"><p class="hint">Loading…</p></div>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`entrypoints/options/main.ts`:

```ts
import { KNOWN_TYPES } from "../../src/model/typeNames";
import { renderOptions } from "../../src/options/view";
import { getGlobal, listCourses, listSeenTypes, removeCourse, resetCourseRules, updateGlobal } from "../../src/storage/store";
import type { Rule } from "../../src/types";

const root = document.getElementById("app") as HTMLElement;

async function refresh(): Promise<void> {
  const [global, seenTypes, courses] = await Promise.all([getGlobal(), listSeenTypes(), listCourses()]);
  const extra = seenTypes.filter((t) => !KNOWN_TYPES.includes(t)).sort();
  renderOptions(root, { global, types: [...KNOWN_TYPES, ...extra], courses }, {
    setGlobalType: (type, value: Rule) => run(updateGlobal((g) => {
      const typeRules = { ...g.typeRules };
      if (value === "track") delete typeRules[type];
      else typeRules[type] = value;
      return { typeRules };
    })),
    resetCourseRules: (id) => run(resetCourseRules(id)),
    removeCourse: (id) => run(removeCourse(id)),
  });
}

function run(p: Promise<unknown>): void {
  p.then(refresh).catch((err: unknown) => {
    console.error("[moodle-todo] options action failed", err);
    alert("Could not save the change. See the console for details.");
  });
}

refresh();
```

`entrypoints/options/style.css`:

```css
:root {
  color-scheme: light;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #222;
  background: #f6f7f9;
}

body {
  margin: 0;
}

main {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1rem 4rem;
}

h1 {
  font-size: 1.6rem;
  margin: 0 0 1.5rem;
}

h2 {
  font-size: 1.15rem;
  margin: 2rem 0 0.5rem;
}

h3 {
  font-size: 1rem;
  margin: 0 0 0.3rem;
}

.hint,
.summary {
  color: #666;
  font-size: 0.9rem;
  margin: 0 0 0.75rem;
}

.type-list {
  display: grid;
  gap: 0.4rem;
}

.type-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}

select {
  font: inherit;
  padding: 0.25rem 0.5rem;
}

.course {
  background: #fff;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.6rem;
}

.buttons {
  display: flex;
  gap: 0.5rem;
}

button {
  font: inherit;
  padding: 0.35rem 0.8rem;
  border-radius: 5px;
  border: 1px solid #c8ccd1;
  background: #fff;
  cursor: pointer;
}

button:hover {
  background: #f0f2f4;
}

button.danger {
  border-color: #d9534f;
  color: #a12622;
}
```

- [ ] **Step 6: Build and check the manifest**

Run: `npm run build && node -e "console.log(require('./.output/chrome-mv3/manifest.json').options_ui)"`
Expected: an object with `page: 'options.html'` and `open_in_tab: true`.

Run: `npm test && npm run compile`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/options src/options tests/options
git commit -m "feat: options page for global type rules and per-course resets" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Manual test against live Moodle

**Files:**
- Create: `docs/manual-test.md`

- [ ] **Step 1: Write the checklist `docs/manual-test.md`**

```markdown
# Manual test checklist

Run `npm run dev`. WXT opens a Chrome window with the extension loaded and reloads it on every save. Log in to https://www.moodle.tum.de in that window.

Repeat the course checks on one course per format:
- weeks: Nanotechnologie (id 120985)
- topics: Modeling and Simulation with ODEs (id 123555)
- onetopic: Engineering Thermodynamics (id 125111)

## Course page

- [ ] Every file, recording, link, folder and assignment has a checkbox left of its icon. Labels have nothing.
- [ ] Announcement forums and surveys have no checkbox and look faded.
- [ ] Clicking a checkbox fades the row and strikes the title. Reload: it stays checked.
- [ ] The progress bar at the top shows "n / m done" without an "unavailable" note (state service worked). m matches the count of tracked items in the whole course.
- [ ] Section (or tab) badges show done/total; a fully done section turns green.
- [ ] onetopic only: tabs you have never opened also show badges.
- [ ] Hover a row: the "⋯" button appears. The menu offers Ignore this item / Ignore all <Type> in this course / Ignore all <Type> everywhere.
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
```

- [ ] **Step 2: Run through the checklist with the user**

Run: `npm run dev`
Work through `docs/manual-test.md` together. Fix any failures with a test-first change in the relevant module, then re-check.

- [ ] **Step 3: Commit**

```bash
git add docs/manual-test.md
git commit -m "docs: add manual test checklist for live Moodle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, dev and fixture instructions" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
