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
