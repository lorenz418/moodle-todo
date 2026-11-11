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

  const stats = { skipped: 0 };
  const sections = topLevel
    .map((el) => parseSection(el, stats))
    .filter((s): s is ParsedSection => s !== null);
  if (stats.skipped > 0) console.warn(`[moodle-todo] skipped ${stats.skipped} unrecognized items`);

  return {
    courseId,
    courseName: doc.querySelector("h1")?.textContent?.trim() ?? "",
    format: classSuffix(body, "format-") ?? "unknown",
    sesskey: findSesskey(doc),
    sections,
    tabs: parseTabs(doc),
  };
}

function strictInt(value: string | undefined | null): number | null {
  return value !== undefined && value !== null && /^\d+$/.test(value) ? Number(value) : null;
}

function sectionNumber(el: HTMLElement): number | null {
  const fromId = /^section-(\d+)$/.exec(el.id);
  return strictInt(el.dataset.sectionid) ?? strictInt(el.dataset.number) ?? (fromId ? Number(fromId[1]) : null);
}

function parseSection(el: HTMLElement, stats: { skipped: number }): ParsedSection | null {
  const num = sectionNumber(el);
  if (num === null) return null;
  const headingEl = firstOwned(el, ".sectionname");
  const name = el.dataset.sectionname?.trim() || headingEl?.textContent?.trim() || `Section ${num}`;
  const items = Array.from(el.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    .map((it) => parseItem(it, stats))
    .filter((i): i is ParsedItem => i !== null);
  return { num, name, headingEl, items };
}

function parseItem(el: HTMLElement, stats: { skipped: number }): ParsedItem | null {
  const cmid = strictInt(el.dataset.id);
  const type = classSuffix(el, "modtype_");
  if (cmid === null || !type) {
    stats.skipped++;
    return null;
  }
  if (SKIPPED_TYPES.has(type)) return null;
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
    const m = /"sesskey"\s*:\s*"([^"]+)"/.exec(script.textContent ?? "");
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
