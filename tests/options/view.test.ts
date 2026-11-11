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
