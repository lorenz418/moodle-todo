import type { CourseProgress, Progress } from "../model/progress";
import { LAYERS, menuState, resolveState } from "../model/rules";
import { typeName, typeNamePlural } from "../model/typeNames";
import { ITEM_SELECTOR } from "../parse/page";
import { NON_TASK_TYPES } from "../types";
import type { CourseData, GlobalData, Layer, ParsedItem, ParsedPage, Rule, RuleItem } from "../types";

export interface RenderModel {
  page: ParsedPage;
  course: CourseData;
  global: GlobalData;
  /** null until the seen cache is ready; badges and the bar then show a loading state. */
  progress: CourseProgress | null;
  fallback: boolean;
  message: string | null;
  /** True once the extension context is gone: controls are shown but cannot be used. */
  disabled: boolean;
}

export interface Handlers {
  onToggleDone(cmid: number, done: boolean): void;
  onMenuAction(layer: Layer, value: Rule, item: RuleItem): void;
}

const FALLBACK_NOTE = "Course state unavailable, counts may be incomplete";
const DOTS_SVG =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>';

/** Renders the whole page from the model. Safe to call repeatedly. */
export function render(doc: Document, model: RenderModel): void {
  let created = false;
  for (const section of model.page.sections) {
    for (const item of section.items) created = renderItem(doc, item, model) || created;
    renderSectionBadge(doc, section.headingEl, model.progress?.sections.get(section.num));
  }
  for (const tab of model.page.tabs ?? []) {
    renderBadge(doc, tab.el, null, model.progress?.sections.get(tab.num));
  }
  renderProgressBar(doc, model);
  // State changes do not move the controls; measuring is only needed for new ones.
  const pageChanged = layouts.get(doc)?.page !== model.page;
  if (created || pageChanged) alignControls(model.page);
  if (pageChanged) watchLayout(doc, model.page);
}

const TASK_ITEM_SELECTOR = ITEM_SELECTOR + [...NON_TASK_TYPES].map((t) => `:not(.modtype_${t})`).join("");

/** Activities on the page that have no checkbox column, e.g. after Moodle re-rendered them. */
export function countUncontrolled(doc: Document): number {
  let count = 0;
  for (const el of doc.querySelectorAll(TASK_ITEM_SELECTOR)) if (!el.querySelector(".mtd-check")) count++;
  return count;
}

function hostOf(item: ParsedItem): HTMLElement {
  return item.el.querySelector<HTMLElement>(":scope .activity-item") ?? item.el;
}

/** Installs delegated event handlers once per document. */
export function installHandlers(doc: Document, handlers: Handlers, signal?: AbortSignal): void {
  doc.addEventListener("change", (e) => {
    const box = (e.target as Element | null)?.closest<HTMLInputElement>(".mtd-checkbox");
    if (!box) return;
    handlers.onToggleDone(Number(box.dataset.cmid), box.checked);
  }, { signal });

  doc.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    const menuBtn = target?.closest<HTMLButtonElement>(".mtd-menu-btn");
    if (menuBtn) {
      // The listener sits on the document, so stopPropagation only shields window-level listeners.
      e.preventDefault();
      e.stopPropagation();
      const wrap = menuBtn.parentElement;
      const wasOpen = wrap?.classList.contains("mtd-open") ?? false;
      closeAllMenus(doc);
      if (wrap && !wasOpen) openMenu(doc, wrap, menuBtn);
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
    if (!target?.closest(".mtd-menu")) closeAllMenus(doc);
  }, { signal });

  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus(doc);
  }, { signal });
}

function openMenu(doc: Document, wrap: HTMLElement, btn: HTMLButtonElement): void {
  const menu = wrap.querySelector<HTMLElement>(".mtd-menu");
  if (!menu) return;
  wrap.classList.add("mtd-open");
  menu.classList.add("mtd-open");
  btn.setAttribute("aria-expanded", "true");
  // Open upward when the menu would run past the bottom of the viewport.
  const view = doc.defaultView;
  const rect = menu.getBoundingClientRect();
  menu.classList.toggle("mtd-up", !!view && rect.height > 0 && rect.bottom > view.innerHeight - 8);
}

function closeAllMenus(doc: Document): void {
  doc.querySelectorAll(".mtd-menu.mtd-open").forEach((m) => m.classList.remove("mtd-open", "mtd-up"));
  doc.querySelectorAll(".mtd-menu-wrap.mtd-open").forEach((w) => {
    w.classList.remove("mtd-open");
    w.querySelector(".mtd-menu-btn")?.setAttribute("aria-expanded", "false");
  });
}

/** Returns true when it had to create the controls (first render, or Moodle replaced the row). */
function renderItem(doc: Document, item: ParsedItem, model: RenderModel): boolean {
  const state = resolveState(item, model.course, model.global);
  const host = hostOf(item);
  let created = false;
  const grid = host.querySelector<HTMLElement>(":scope > .activity-grid");

  item.el.classList.toggle("mtd-done", state === "done");
  item.el.classList.toggle("mtd-ignored", state === "ignored");

  let check = host.querySelector<HTMLElement>(":scope > .mtd-check");
  if (!check) {
    created = true;
    check = doc.createElement("span");
    check.className = "mtd-check";
    if (grid) host.insertBefore(check, grid);
    else host.insertBefore(check, host.firstChild);
  }

  if (state === "ignored") {
    let mark = check.querySelector<HTMLElement>(".mtd-ignored-mark");
    if (!mark) {
      mark = doc.createElement("span");
      mark.className = "mtd-ignored-mark";
      mark.title = "Not a task (ignored)";
      check.replaceChildren(mark);
    }
  } else {
    let box = check.querySelector<HTMLInputElement>(".mtd-checkbox");
    if (!box) {
      box = doc.createElement("input");
      box.type = "checkbox";
      box.className = "mtd-checkbox";
      box.dataset.cmid = String(item.cmid);
      box.title = "Mark as done";
      check.replaceChildren(box);
    }
    box.checked = state === "done";
    box.disabled = model.disabled;
    box.setAttribute("aria-label", `Mark ${item.name} as done`);
  }

  let wrap = host.querySelector<HTMLElement>(":scope > .mtd-menu-wrap");
  if (!wrap) {
    created = true;
    wrap = doc.createElement("span");
    wrap.className = "mtd-menu-wrap";
    const menu = doc.createElement("div");
    menu.className = "mtd-menu";
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "mtd-menu-btn";
    btn.title = "Todo options";
    btn.setAttribute("aria-label", "Todo options");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = DOTS_SVG; // static markup, no page data
    wrap.append(menu, btn);
    host.appendChild(wrap);
  }
  wrap.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.disabled = model.disabled;
  wrap.dataset.cmid = String(item.cmid);
  wrap.dataset.type = item.type;
  renderMenuItems(doc, wrap.querySelector(".mtd-menu")!, item, model);
  return created;
}

function renderMenuItems(doc: Document, menu: Element, item: RuleItem, model: RenderModel): void {
  const plural = typeNamePlural(item.type);
  const specs = LAYERS.map((layer) => {
    const current = menuState(layer, item, model.course, model.global);
    const value: Rule = current === "ignore" ? "track" : "ignore";
    const verb = value === "ignore" ? "Ignore" : "Track";
    const label =
      layer === "item" ? `${verb} this item`
      : layer === "course" ? `${verb} all ${plural} in this course`
      : `${verb} all ${plural} everywhere`;
    return { layer, value, label };
  });
  const buttons = Array.from(menu.querySelectorAll<HTMLElement>(".mtd-menu-item"));
  const same =
    buttons.length === specs.length &&
    specs.every((s, i) => buttons[i]!.dataset.layer === s.layer && buttons[i]!.dataset.value === s.value && buttons[i]!.textContent === s.label);
  if (same) return;

  const heading = doc.createElement("div");
  heading.className = "mtd-menu-heading";
  heading.textContent = typeName(item.type);
  menu.replaceChildren(
    heading,
    ...specs.map((s) => {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "mtd-menu-item";
      btn.dataset.layer = s.layer;
      btn.dataset.value = s.value;
      btn.textContent = s.label;
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
  badge.textContent = `${progress.done}/${progress.total}`;
  // Used by the compact tab variant, which draws a progress line instead of text.
  badge.style.setProperty("--mtd-pct", `${Math.round((progress.done / progress.total) * 100)}%`);
  badge.classList.toggle("mtd-complete", complete);
  badge.title = complete ? "All done" : `${progress.done} of ${progress.total} done`;
}

function renderProgressBar(doc: Document, model: RenderModel): void {
  let bar = doc.querySelector<HTMLElement>(".mtd-progress");
  if (!bar) {
    const content = doc.querySelector(".course-content") ?? doc.querySelector('li.section[data-for="section"]')?.closest("ul") ?? null;
    if (!content?.parentElement) return;
    bar = doc.createElement("div");
    bar.className = "mtd-progress";
    // Static skeleton only; all dynamic text is set via textContent below.
    bar.innerHTML =
      '<div class="mtd-progress-row">' +
      '<span class="mtd-progress-label">Your progress</span>' +
      '<span class="mtd-progress-text"></span>' +
      '<span class="mtd-progress-percent"></span>' +
      "</div>" +
      '<div class="mtd-progress-track"><div class="mtd-progress-fill"></div></div>' +
      '<div class="mtd-progress-note"></div>' +
      '<div class="mtd-progress-message" role="status"></div>';
    content.parentElement.insertBefore(bar, content);
  }
  const text = bar.querySelector<HTMLElement>(".mtd-progress-text")!;
  const percent = bar.querySelector<HTMLElement>(".mtd-progress-percent")!;
  const fill = bar.querySelector<HTMLElement>(".mtd-progress-fill")!;
  const note = bar.querySelector<HTMLElement>(".mtd-progress-note")!;
  const message = bar.querySelector<HTMLElement>(".mtd-progress-message")!;

  const course = model.progress?.course;
  bar.classList.toggle("mtd-loading", !course);
  bar.classList.toggle("mtd-complete", !!course && course.total > 0 && course.done === course.total);
  if (!course) {
    text.textContent = "Loading…";
    percent.textContent = "";
    fill.style.width = "0%";
  } else if (course.total === 0) {
    text.textContent = "Nothing to track yet";
    percent.textContent = "";
    fill.style.width = "0%";
  } else {
    const pct = Math.round((course.done / course.total) * 100);
    text.textContent = `${course.done} of ${course.total} done`;
    percent.textContent = `${pct}%`;
    fill.style.width = `${pct}%`;
  }
  note.textContent = model.fallback ? FALLBACK_NOTE : "";
  note.hidden = !model.fallback;
  message.textContent = model.message ?? "";
  message.hidden = !model.message;
}

/**
 * Centers the checkbox and the options button on the activity icon, so they sit
 * on the title row even when a description follows. Moodle's padding differs
 * between themes, so the offset is measured from where each control lands with
 * no margin rather than from the row's edge. Reads all positions before writing
 * any of them; skips rows that are not laid out (collapsed sections, jsdom).
 */
function alignControls(page: ParsedPage): void {
  const rows: Array<{ els: HTMLElement[]; icon: HTMLElement }> = [];
  for (const section of page.sections) {
    for (const item of section.items) {
      const host = hostOf(item);
      const icon = host.querySelector<HTMLElement>(".activity-icon");
      const els = [":scope > .mtd-check", ":scope > .mtd-menu-wrap"]
        .map((sel) => host.querySelector<HTMLElement>(sel))
        .filter((el): el is HTMLElement => el !== null);
      if (icon && els.length > 0) rows.push({ els, icon });
    }
  }
  for (const row of rows) for (const el of row.els) el.style.marginTop = "0px";
  const jobs: Array<{ el: HTMLElement; margin: number; height: number }> = [];
  for (const row of rows) {
    const iconRect = row.icon.getBoundingClientRect();
    if (iconRect.height === 0) continue;
    for (const el of row.els) {
      jobs.push({ el, margin: iconRect.top - el.getBoundingClientRect().top, height: iconRect.height });
    }
  }
  for (const job of jobs) {
    job.el.style.marginTop = `${Math.max(0, Math.round(job.margin))}px`;
    job.el.style.height = `${job.height}px`;
  }
}

const layouts = new WeakMap<Document, { page: ParsedPage; observer: ResizeObserver | null }>();

/** Re-aligns when a section is expanded or the layout changes after the first render. */
function watchLayout(doc: Document, page: ParsedPage): void {
  layouts.get(doc)?.observer?.disconnect();
  const view = doc.defaultView;
  const RO = view?.ResizeObserver;
  if (!view || !RO) {
    layouts.set(doc, { page, observer: null });
    return;
  }
  let queued = false;
  const observer = new RO(() => {
    if (queued) return;
    queued = true;
    view.requestAnimationFrame(() => {
      queued = false;
      alignControls(page);
    });
  });
  for (const section of page.sections) {
    const el = section.items[0]?.el.closest("li.section") ?? null;
    if (el) observer.observe(el);
  }
  layouts.set(doc, { page, observer });
}
