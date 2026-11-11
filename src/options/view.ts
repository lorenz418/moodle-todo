import { typeName, typeNamePlural } from "../model/typeNames";
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

const DESCRIPTIONS: Record<string, string> = {
  resource: "PDFs, slides, notebooks and other files",
  lti: "TUM-Live lecture recordings and videos",
  url: "Links to external pages and tools",
  folder: "Folders with several files",
  assign: "Assignments you hand in on Moodle",
  forum: "Announcement and discussion forums",
  choice: "Polls and surveys",
  quiz: "Moodle quizzes",
  page: "Text pages inside Moodle",
};

export function renderOptions(root: HTMLElement, data: OptionsData, actions: OptionsActions): void {
  root.replaceChildren();
  const doc = root.ownerDocument;

  const globalSection = el(doc, "section", "panel");
  globalSection.append(
    el(doc, "h2", null, "What counts as a task"),
    el(doc, "p", "hint", "Applies to every course. You can still change single items or a whole course from the ⋯ menu next to each item."),
  );
  const list = el(doc, "div", "type-list");
  for (const type of data.types) list.append(typeRow(doc, type, data.global.typeRules[type] ?? "track", actions));
  globalSection.append(list);
  root.append(globalSection);

  const coursesSection = el(doc, "section", "panel");
  coursesSection.append(el(doc, "h2", null, "Courses"));
  if (data.courses.length === 0) {
    coursesSection.append(el(doc, "p", "empty", "No courses yet. Open a course on Moodle and check something off."));
  }
  const sorted = [...data.courses].sort((a, b) => courseTitle(a).localeCompare(courseTitle(b)));
  for (const course of sorted) coursesSection.append(courseRow(doc, course, actions));
  root.append(coursesSection);
}

function typeRow(doc: Document, type: string, value: Rule, actions: OptionsActions): HTMLElement {
  const row = el(doc, "div", "type-row");
  const text = el(doc, "div", "type-text");
  text.append(el(doc, "span", "type-name", typeName(type)));
  text.append(el(doc, "span", "type-desc", DESCRIPTIONS[type] ?? `Moodle activity type "${type}"`));

  const group = el(doc, "div", "segmented");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", `${typeName(type)}: track or ignore`);
  for (const v of ["track", "ignore"] as Rule[]) {
    const label = el(doc, "label", "segment");
    const input = doc.createElement("input");
    input.type = "radio";
    input.name = `type-${type}`;
    input.value = v;
    input.dataset.type = type;
    input.checked = value === v;
    input.addEventListener("change", () => {
      if (input.checked) actions.setGlobalType(type, v);
    });
    label.append(input, el(doc, "span", null, v === "track" ? "Track" : "Ignore"));
    group.append(label);
  }
  row.append(text, group);
  return row;
}

function courseRow(doc: Document, course: { id: number; data: CourseData }, actions: OptionsActions): HTMLElement {
  const card = el(doc, "div", "course");
  const info = el(doc, "div", "course-info");
  info.append(el(doc, "h3", null, courseTitle(course)));

  const rules = Object.entries(course.data.typeRules).map(
    ([t, v]) => `${typeNamePlural(t)} ${v === "track" ? "tracked" : "ignored"}`,
  );
  const overrides = Object.keys(course.data.itemOverrides).length;
  const meta = el(doc, "p", "meta");
  meta.append(el(doc, "span", "done-count", `${course.data.done.length} done`));
  const parts = [
    ...(rules.length ? rules : ["Using global rules"]),
    ...(overrides ? [`${overrides} item${overrides === 1 ? "" : "s"} set individually`] : []),
  ];
  for (const part of parts) meta.append(el(doc, "span", null, part));
  info.append(meta);

  const buttons = el(doc, "div", "buttons");
  const reset = button(doc, "Reset rules", "reset-rules", "Removes course and item rules, keeps checkmarks");
  reset.addEventListener("click", () => {
    if (confirm(`Reset all rules for "${courseTitle(course)}"? Checkmarks are kept.`)) actions.resetCourseRules(course.id);
  });
  const remove = button(doc, "Clear all", "remove", "Removes rules and all checkmarks for this course");
  remove.classList.add("danger");
  remove.addEventListener("click", () => {
    if (confirm(`Delete all rules and checkmarks for "${courseTitle(course)}"? This cannot be undone.`)) actions.removeCourse(course.id);
  });
  buttons.append(reset, remove);

  card.append(info, buttons);
  return card;
}

function button(doc: Document, text: string, action: string, title: string): HTMLButtonElement {
  const b = el(doc, "button", "btn", text) as HTMLButtonElement;
  b.type = "button";
  b.dataset.action = action;
  b.title = title;
  return b;
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
