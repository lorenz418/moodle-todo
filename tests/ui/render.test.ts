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
