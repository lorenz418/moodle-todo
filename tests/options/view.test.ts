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
    const checked = root.querySelectorAll<HTMLInputElement>("input[type=radio][data-type]:checked");
    expect(Array.from(checked).map((r) => [r.dataset.type, r.value])).toEqual([
      ["resource", "track"], ["forum", "ignore"], ["choice", "ignore"], ["h5pactivity", "track"],
    ]);
    expect(root.textContent).toContain("File");
    expect(root.textContent).toContain("h5pactivity");
  });

  it("calls setGlobalType when a toggle changes", () => {
    const root = document.createElement("div");
    const a = actions();
    renderOptions(root, data(), a);
    document.body.append(root); // jsdom only fires change for connected radios
    const ignore = root.querySelector<HTMLInputElement>('input[data-type="resource"][value="ignore"]')!;
    ignore.click();
    root.remove();
    expect(a.setGlobalType).toHaveBeenCalledWith("resource", "ignore");
  });

  it("lists courses sorted by title, with an id fallback, their rules and override counts", () => {
    const root = document.createElement("div");
    renderOptions(root, data(), actions());
    const cards = root.querySelectorAll(".course");
    expect(cards).toHaveLength(2);
    // "Course 8" sorts before "Nano"
    expect(cards[0]!.querySelector("h3")!.textContent).toBe("Course 8");
    expect(cards[0]!.textContent).toContain("Using global rules");
    expect(cards[0]!.textContent).toContain("1 done");
    expect(cards[1]!.querySelector("h3")!.textContent).toBe("Nano");
    expect(cards[1]!.textContent).toContain("Links tracked");
    expect(cards[1]!.textContent).toContain("2 items set individually");
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

describe("renderOptions escaping", () => {
  it("renders a hostile course name as text", () => {
    const root = document.createElement("div");
    const name = "<img src=x onerror=alert(1)>";
    renderOptions(root, data({ courses: [{ id: 9, data: { ...emptyCourse(), name } }] }), actions());
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".course h3")!.textContent).toBe(name);
  });
});
