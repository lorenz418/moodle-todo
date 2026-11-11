import { describe, expect, it } from "vitest";
import { computeProgress } from "../../src/model/progress";
import { DEFAULT_GLOBAL, emptyCourse, type SeenCache } from "../../src/types";

const seen: SeenCache = {
  "1": { section: 0, type: "forum" },
  "2": { section: 1, type: "resource" },
  "3": { section: 1, type: "lti" },
  "4": { section: 2, type: "resource" },
  "5": { section: 2, type: "resource" },
  "6": { section: 2, type: "choice" },
};

describe("computeProgress", () => {
  it("counts tracked items per section and for the course, skipping ignored types", () => {
    const p = computeProgress(seen, { ...emptyCourse(), done: [2, 4] }, DEFAULT_GLOBAL);
    expect(p.course).toEqual({ done: 2, total: 4 });
    expect(p.sections.get(0)).toBeUndefined();
    expect(p.sections.get(1)).toEqual({ done: 1, total: 2 });
    expect(p.sections.get(2)).toEqual({ done: 1, total: 2 });
  });

  it("ignores done cmids that are not in the seen cache", () => {
    const p = computeProgress(seen, { ...emptyCourse(), done: [2, 999] }, DEFAULT_GLOBAL);
    expect(p.course).toEqual({ done: 1, total: 4 });
  });

  it("honours item overrides", () => {
    const course = { ...emptyCourse(), done: [1], itemOverrides: { "1": "track" as const, "2": "ignore" as const } };
    const p = computeProgress(seen, course, DEFAULT_GLOBAL);
    expect(p.sections.get(0)).toEqual({ done: 1, total: 1 });
    expect(p.sections.get(1)).toEqual({ done: 0, total: 1 });
    expect(p.course).toEqual({ done: 1, total: 4 });
  });

  it("returns zero totals for an empty cache", () => {
    const p = computeProgress({}, emptyCourse(), DEFAULT_GLOBAL);
    expect(p.course).toEqual({ done: 0, total: 0 });
    expect(p.sections.size).toBe(0);
  });
});
