export interface PopupCourse {
  id: number;
  name: string;
  done: number;
  total: number;
}

export interface PopupActions {
  openCourse(id: number): void;
  openOptions(): void;
}

export function renderPopup(root: HTMLElement, courses: PopupCourse[], actions: PopupActions): void {
  const doc = root.ownerDocument;
  root.replaceChildren();

  const header = el(doc, "header", "head");
  const title = el(doc, "div", "title");
  const logo = doc.createElement("img");
  logo.src = "/icon/48.png";
  logo.alt = "";
  logo.width = 22;
  logo.height = 22;
  title.append(logo, el(doc, "span", null, "Moodle Todo"));
  const settings = el(doc, "button", "icon-btn") as HTMLButtonElement;
  settings.type = "button";
  settings.dataset.action = "options";
  settings.title = "Settings";
  settings.setAttribute("aria-label", "Settings");
  settings.addEventListener("click", () => actions.openOptions());
  header.append(title, settings);
  root.append(header);

  if (courses.length === 0) {
    root.append(el(doc, "p", "empty", "No courses yet. Open a course on Moodle and check something off."));
    return;
  }

  const list = el(doc, "ul", "courses");
  const sorted = [...courses].sort((a, b) => a.name.localeCompare(b.name));
  for (const course of sorted) {
    const item = el(doc, "li", null);
    const row = el(doc, "button", "course") as HTMLButtonElement;
    row.type = "button";
    row.dataset.course = String(course.id);
    row.title = `Open ${course.name} on Moodle`;
    row.addEventListener("click", () => actions.openCourse(course.id));

    const complete = course.total > 0 && course.done === course.total;
    if (complete) row.classList.add("complete");
    const pct = course.total > 0 ? Math.round((course.done / course.total) * 100) : 0;

    const top = el(doc, "span", "row-top");
    top.append(
      el(doc, "span", "name", course.name),
      el(doc, "span", "count", course.total > 0 ? `${course.done}/${course.total}` : "–"),
    );
    const bar = el(doc, "span", "bar");
    const fill = el(doc, "span", "fill");
    fill.style.width = `${pct}%`;
    bar.append(fill);
    row.append(top, bar);
    item.append(row);
    list.append(item);
  }
  root.append(list);
}

function el(doc: Document, tag: string, className: string | null, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
