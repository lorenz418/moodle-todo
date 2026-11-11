import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(p.sesskey).toBe("REDACTED00");
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

  describe("strictness and warnings", () => {
    const page = (items: string, sectionAttrs = 'data-sectionid="1"') =>
      new DOMParser().parseFromString(
        `<html><body class="course-9 format-topics"><h1>C</h1>
        <ul><li class="section course-section" data-for="section" ${sectionAttrs}>
        <ul data-for="cmlist">${items}</ul></li></ul></body></html>`,
        "text/html",
      );
    const item = (id: string, cls: string) =>
      `<li class="activity ${cls}" data-for="cmitem" data-id="${id}"><div class="activity-item" data-activityname="N${id}"></div></li>`;

    afterEach(() => vi.restoreAllMocks());

    it("warns once and keeps other items when an item lacks a modtype class", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const p = parsePage(page(item("1", "modtype_url") + item("2", "") + item("3", "modtype_resource")))!;
      expect(p.sections[0]!.items.map((i) => i.cmid)).toEqual([1, 3]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("[moodle-todo] skipped 1 unrecognized items");
    });

    it("drops an item with an empty data-id and counts it", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const p = parsePage(page(item("", "modtype_url") + item("4", "modtype_url")))!;
      expect(p.sections[0]!.items.map((i) => i.cmid)).toEqual([4]);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("does not warn for labels and subsections", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      parsePage(page(item("1", "modtype_label") + item("2", "modtype_url")));
      expect(warn).not.toHaveBeenCalled();
    });

    it("skips a section with no usable number and falls back to the section-N id", () => {
      expect(parsePage(page(item("1", "modtype_url"), 'data-sectionid=""'))!.sections).toHaveLength(0);
      const p = parsePage(page(item("1", "modtype_url"), 'data-sectionid="" id="section-7"'))!;
      expect(p.sections.map((s) => s.num)).toEqual([7]);
    });
  });
});
