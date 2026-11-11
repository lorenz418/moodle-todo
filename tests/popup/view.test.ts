import { describe, expect, it, vi } from "vitest";
import { renderPopup } from "../../src/popup/view";

describe("renderPopup", () => {
  it("lists courses by name with counts, marks complete ones and opens them", () => {
    const root = document.createElement("div");
    const actions = { openCourse: vi.fn(), openOptions: vi.fn() };
    renderPopup(root, [
      { id: 2, name: "Thermo", done: 3, total: 3 },
      { id: 1, name: "Nano", done: 1, total: 8 },
      { id: 3, name: "Empty", done: 0, total: 0 },
    ], actions);
    const rows = Array.from(root.querySelectorAll<HTMLButtonElement>(".course"));
    expect(rows.map((r) => [r.querySelector(".name")!.textContent, r.querySelector(".count")!.textContent])).toEqual([
      ["Empty", "–"], ["Nano", "1/8"], ["Thermo", "3/3"],
    ]);
    expect(rows[2]!.classList.contains("complete")).toBe(true);
    expect(rows[1]!.querySelector<HTMLElement>(".fill")!.style.width).toBe("13%");
    rows[1]!.click();
    expect(actions.openCourse).toHaveBeenCalledWith(1);
    root.querySelector<HTMLButtonElement>('[data-action="options"]')!.click();
    expect(actions.openOptions).toHaveBeenCalled();
  });

  it("shows an empty state and renders names as text", () => {
    const root = document.createElement("div");
    renderPopup(root, [], { openCourse: vi.fn(), openOptions: vi.fn() });
    expect(root.textContent).toContain("No courses yet");
    renderPopup(root, [{ id: 1, name: "<img src=x>", done: 0, total: 1 }], { openCourse: vi.fn(), openOptions: vi.fn() });
    expect(root.querySelector("img:not([src$='48.png'])")).toBeNull();
  });
});
