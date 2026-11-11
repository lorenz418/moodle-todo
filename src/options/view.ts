import { typeName, typeNamePlural } from "../model/typeNames";
import type { CourseData, GlobalData, Rule } from "../types";

export interface OptionsData {
  global: GlobalData;
  /** All types to show toggles for, already ordered. */
  types: string[];
  /** `types` lists the module types seen in that course, if known. */
  courses: Array<{ id: number; data: CourseData; types?: string[] }>;
}

type CourseEntry = OptionsData["courses"][number];

export interface OptionsActions {
  setGlobalType(type: string, value: Rule): void;
  /** null removes the course rule, so the global rule applies again. */
  setCourseType(id: number, type: string, value: Rule | null): void;
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
  // Re-rendering after every change must not collapse the course the user is editing.
  const open = new Set(Array.from(root.querySelectorAll<HTMLElement>("details[open][data-course]"), (d) => d.dataset.course));
  root.replaceChildren();
  const doc = root.ownerDocument;

  const globalSection = el(doc, "section", "panel");
  globalSection.append(
    el(doc, "h2", null, "What counts as a task"),
    el(doc, "p", "hint", "These apply to every course. A course can override them under Courses below, and a single item can override its course from the ⋯ menu next to it on Moodle. The most specific rule wins: item, then course, then these."),
  );
  const list = el(doc, "div", "type-list");
  for (const type of data.types) list.append(typeRow(doc, type, data.global.typeRules[type] ?? "track", actions));
  globalSection.append(list);
  root.append(globalSection);

  const coursesSection = el(doc, "section", "panel");
  coursesSection.append(
    el(doc, "h2", null, "Courses"),
    el(doc, "p", "hint", "Open a course to track or ignore a type only there. \u201cGlobal\u201d follows the setting above."),
  );
  if (data.courses.length === 0) {
    coursesSection.append(el(doc, "p", "empty", "No courses yet. Open a course on Moodle and check something off."));
  }
  const sorted = [...data.courses].sort((a, b) => courseTitle(a).localeCompare(courseTitle(b)));
  for (const course of sorted) coursesSection.append(courseRow(doc, course, data, open.has(String(course.id)), actions));
  root.append(coursesSection);
}

function typeRow(doc: Document, type: string, value: Rule, actions: OptionsActions): HTMLElement {
  const row = el(doc, "div", "type-row");
  const text = el(doc, "div", "type-text");
  text.append(el(doc, "span", "type-name", typeName(type)));
  text.append(el(doc, "span", "type-desc", DESCRIPTIONS[type] ?? `Moodle activity type "${type}"`));

  const group = segmented(doc, `type-${type}`, `${typeName(type)}: track or ignore`, [
    { value: "track", label: "Track" },
    { value: "ignore", label: "Ignore" },
  ], value, (v) => actions.setGlobalType(type, v as Rule));
  for (const input of group.querySelectorAll("input")) input.dataset.type = type;
  row.append(text, group);
  return row;
}

function segmented(
  doc: Document,
  name: string,
  label: string,
  options: Array<{ value: string; label: string }>,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const group = el(doc, "div", "segmented");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", label);
  for (const option of options) {
    const segment = el(doc, "label", "segment");
    const input = doc.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.checked = value === option.value;
    input.addEventListener("change", () => {
      if (input.checked) onChange(option.value);
    });
    segment.append(input, el(doc, "span", null, option.label));
    group.append(segment);
  }
  return group;
}

function courseRow(doc: Document, course: CourseEntry, data: OptionsData, open: boolean, actions: OptionsActions): HTMLElement {
  const card = el(doc, "div", "course");
  const head = el(doc, "div", "course-head");
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
  head.append(info, buttons);

  const details = el(doc, "details", "course-rules") as HTMLDetailsElement;
  details.dataset.course = String(course.id);
  details.open = open;
  details.append(el(doc, "summary", null, "Rules for this course"));
  const list = el(doc, "div", "type-list");
  for (const type of courseTypes(course, data)) {
    const globalRule = data.global.typeRules[type] ?? "track";
    const row = el(doc, "div", "type-row");
    const text = el(doc, "div", "type-text");
    text.append(
      el(doc, "span", "type-name", typeName(type)),
      el(doc, "span", "type-desc", `Global setting: ${globalRule === "track" ? "Track" : "Ignore"}`),
    );
    const group = segmented(doc, `course-${course.id}-${type}`, `${typeName(type)} in ${courseTitle(course)}`, [
      { value: "global", label: "Global" },
      { value: "track", label: "Track" },
      { value: "ignore", label: "Ignore" },
    ], course.data.typeRules[type] ?? "global", (v) => actions.setCourseType(course.id, type, v === "global" ? null : (v as Rule)));
    for (const input of group.querySelectorAll("input")) {
      input.dataset.course = String(course.id);
      input.dataset.type = type;
    }
    row.append(text, group);
    list.append(row);
  }
  details.append(list);

  card.append(head, details);
  return card;
}

/** Types seen in the course plus any with a course rule, in the order of the global list. */
function courseTypes(course: CourseEntry, data: OptionsData): string[] {
  if (!course.types) return data.types;
  const present = new Set([...course.types, ...Object.keys(course.data.typeRules)]);
  return [...data.types.filter((t) => present.has(t)), ...[...present].filter((t) => !data.types.includes(t)).sort()];
}

function button(doc: Document, text: string, action: string, title: string): HTMLButtonElement {
  const b = el(doc, "button", "btn", text) as HTMLButtonElement;
  b.type = "button";
  b.dataset.action = action;
  b.title = title;
  return b;
}

function courseTitle(course: CourseEntry): string {
  return course.data.name || `Course ${course.id}`;
}

function el(doc: Document, tag: string, className: string | null, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
