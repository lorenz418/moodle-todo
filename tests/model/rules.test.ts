import { describe, expect, it } from "vitest";
import { applyMenuAction, menuState, resolveState, toggleDone } from "../../src/model/rules";
import { DEFAULT_GLOBAL, emptyCourse, type CourseData, type GlobalData } from "../../src/types";

const forum = { cmid: 10, type: "forum" };
const file = { cmid: 20, type: "resource" };

function course(partial: Partial<CourseData> = {}): CourseData {
  return { ...emptyCourse(), ...partial };
}

describe("resolveState precedence", () => {
  it.each([
    ["default is track", course(), { typeRules: {} }, file, "open"],
    ["global ignore", course(), DEFAULT_GLOBAL, forum, "ignored"],
    ["course track beats global ignore", course({ typeRules: { forum: "track" } }), DEFAULT_GLOBAL, forum, "open"],
    ["course ignore beats global default", course({ typeRules: { resource: "ignore" } }), { typeRules: {} }, file, "ignored"],
    ["item track beats course ignore", course({ typeRules: { resource: "ignore" }, itemOverrides: { "20": "track" } }), { typeRules: {} }, file, "open"],
    ["item ignore beats everything", course({ typeRules: { resource: "track" }, itemOverrides: { "20": "ignore" } }), { typeRules: {} }, file, "ignored"],
    ["done when tracked and in done list", course({ done: [20] }), { typeRules: {} }, file, "done"],
    ["ignored even if in done list", course({ done: [10] }), DEFAULT_GLOBAL, forum, "ignored"],
  ] as const)("%s", (_name, c, g: GlobalData, item, expected) => {
    expect(resolveState(item, c, g)).toBe(expected);
  });

  it("keeps the done flag while ignored so restoring brings it back", () => {
    const c = course({ done: [10], itemOverrides: { "10": "ignore" } });
    expect(resolveState(forum, c, { typeRules: {} })).toBe("ignored");
    const restored = applyMenuAction("item", "track", forum, c, { typeRules: {} }).course;
    expect(resolveState(forum, restored, { typeRules: {} })).toBe("done");
  });
});

describe("menuState (labels) for the spec example: forums ignored globally, one forum tracked by override", () => {
  const c = course({ itemOverrides: { "10": "track" } });
  it("item layer reflects the item's effective rule", () => {
    expect(menuState("item", forum, c, DEFAULT_GLOBAL)).toBe("track");
  });
  it("course layer falls back to the global rule", () => {
    expect(menuState("course", forum, c, DEFAULT_GLOBAL)).toBe("ignore");
  });
  it("global layer reads the global rule", () => {
    expect(menuState("global", forum, c, DEFAULT_GLOBAL)).toBe("ignore");
  });
});

describe("applyMenuAction writes or removes rules", () => {
  it("writes an item override when it differs from the inherited value", () => {
    const r = applyMenuAction("item", "ignore", file, course(), { typeRules: {} });
    expect(r.course.itemOverrides).toEqual({ "20": "ignore" });
    expect(r.global).toEqual({ typeRules: {} });
  });

  it("removes an item override when the new value equals the inherited value", () => {
    const c = course({ itemOverrides: { "20": "ignore" } });
    const r = applyMenuAction("item", "track", file, c, { typeRules: {} });
    expect(r.course.itemOverrides).toEqual({});
  });

  it("spec example: ignoring the tracked forum item removes the override (global already ignores)", () => {
    const c = course({ itemOverrides: { "10": "track" } });
    const r = applyMenuAction("item", "ignore", forum, c, DEFAULT_GLOBAL);
    expect(r.course.itemOverrides).toEqual({});
    expect(resolveState(forum, r.course, DEFAULT_GLOBAL)).toBe("ignored");
  });

  it("spec example: tracking forums in the course writes a course rule", () => {
    const r = applyMenuAction("course", "track", forum, course(), DEFAULT_GLOBAL);
    expect(r.course.typeRules).toEqual({ forum: "track" });
  });

  it("spec example: tracking forums globally removes the global rule (track is the default)", () => {
    const r = applyMenuAction("global", "track", forum, course(), DEFAULT_GLOBAL);
    expect(r.global.typeRules).toEqual({ choice: "ignore" });
  });

  it("ignoring a type globally writes a global rule", () => {
    const r = applyMenuAction("global", "ignore", file, course(), { typeRules: {} });
    expect(r.global.typeRules).toEqual({ resource: "ignore" });
  });

  it("removes a course rule that equals the global rule", () => {
    const c = course({ typeRules: { forum: "ignore" } });
    const r = applyMenuAction("course", "ignore", forum, c, DEFAULT_GLOBAL);
    expect(r.course.typeRules).toEqual({});
  });

  it("does not mutate its inputs", () => {
    const c = course();
    const g: GlobalData = { typeRules: {} };
    applyMenuAction("item", "ignore", file, c, g);
    applyMenuAction("global", "ignore", file, c, g);
    expect(c).toEqual(course());
    expect(g).toEqual({ typeRules: {} });
  });
});

describe("toggleDone", () => {
  it("adds and removes cmids, keeps the list sorted and unique", () => {
    let c = toggleDone(course({ done: [30] }), 20, true);
    expect(c.done).toEqual([20, 30]);
    c = toggleDone(c, 20, true);
    expect(c.done).toEqual([20, 30]);
    c = toggleDone(c, 30, false);
    expect(c.done).toEqual([20]);
  });
});
