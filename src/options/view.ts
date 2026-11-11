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
      if (confirm(`Reset all rules for "${courseTitle(course)}"? Checkmarks are kept.`)) actions.resetCourseRules(course.id);
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
