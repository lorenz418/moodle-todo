import { describe, expect, it, vi } from "vitest";
import { storage } from "wxt/utils/storage";
import {
  getCourse, getGlobal, getSeen, listCourses, listSeenTypes, mergeSeenSections, removeCourse,
  resetCourseRules, setSeen, updateCourse, updateGlobal, watchCourse, watchGlobal,
} from "../../src/storage/store";
import { DEFAULT_GLOBAL, emptyCourse } from "../../src/types";

describe("store", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await getGlobal()).toEqual(DEFAULT_GLOBAL);
    expect(await getCourse(7)).toEqual(emptyCourse());
    expect(await getSeen(7)).toEqual({});
  });

  it("fills missing fields of malformed stored data", async () => {
    await storage.setItem("sync:course:8", { name: "Partial" });
    expect(await getCourse(8)).toEqual({ ...emptyCourse(), name: "Partial", done: [] });
    await storage.setItem("sync:global", {});
    expect((await getGlobal()).typeRules).toEqual(DEFAULT_GLOBAL.typeRules);
  });

  it("updates read-modify-write and persists", async () => {
    await updateCourse(7, (c) => ({ ...c, name: "Nano", done: [1] }));
    await updateCourse(7, (c) => ({ ...c, done: [...c.done, 2] }));
    expect(await getCourse(7)).toEqual({ ...emptyCourse(), name: "Nano", done: [1, 2] });
    expect(await storage.getItem("sync:course:7")).toEqual({ ...emptyCourse(), name: "Nano", done: [1, 2] });

    await updateGlobal((g) => ({ typeRules: { ...g.typeRules, url: "ignore" } }));
    expect((await getGlobal()).typeRules).toEqual({ forum: "ignore", choice: "ignore", url: "ignore" });
  });

  it("replaces the seen cache wholesale with setSeen", async () => {
    await setSeen(7, { "1": { section: 0, type: "forum" } });
    await setSeen(7, { "2": { section: 1, type: "resource" } });
    expect(await getSeen(7)).toEqual({ "2": { section: 1, type: "resource" } });
  });

  it("mergeSeenSections replaces only the given sections", async () => {
    await setSeen(7, {
      "1": { section: 0, type: "forum" },
      "2": { section: 1, type: "resource" },
      "3": { section: 1, type: "resource" },
    });
    const next = await mergeSeenSections(7, [1], [{ cmid: 3, type: "resource", section: 1 }, { cmid: 4, type: "lti", section: 1 }]);
    expect(next).toEqual({
      "1": { section: 0, type: "forum" },
      "3": { section: 1, type: "resource" },
      "4": { section: 1, type: "lti" },
    });
    expect(await getSeen(7)).toEqual(next);
  });

  it("watches course and global changes", async () => {
    const onCourse = vi.fn();
    const onGlobal = vi.fn();
    const stop1 = watchCourse(7, onCourse);
    const stop2 = watchGlobal(onGlobal);
    await updateCourse(7, (c) => ({ ...c, done: [5] }));
    await updateGlobal((g) => ({ typeRules: { ...g.typeRules, url: "ignore" } }));
    expect(onCourse).toHaveBeenCalledWith(expect.objectContaining({ done: [5] }));
    expect(onGlobal).toHaveBeenCalledWith(expect.objectContaining({ typeRules: expect.objectContaining({ url: "ignore" }) }));
    stop1();
    stop2();
  });

  it("lists courses and seen types for the options page", async () => {
    await updateCourse(7, (c) => ({ ...c, name: "Nano" }));
    await updateCourse(8, (c) => ({ ...c, typeRules: { h5pactivity: "ignore" } }));
    await setSeen(7, { "1": { section: 0, type: "forum" }, "2": { section: 1, type: "lti" } });
    const courses = await listCourses();
    expect(courses.map((c) => c.id).sort()).toEqual([7, 8]);
    expect(courses.find((c) => c.id === 7)?.data.name).toBe("Nano");
    // "choice" comes from the default global rules (DEFAULT_GLOBAL), "h5pactivity" from a course rule.
    expect((await listSeenTypes(await getGlobal(), courses)).sort()).toEqual(["choice", "forum", "h5pactivity", "lti"]);
  });

  it("resetCourseRules keeps checkmarks, removeCourse removes everything", async () => {
    await updateCourse(7, (c) => ({ ...c, name: "Nano", done: [1], itemOverrides: { "1": "ignore" }, typeRules: { url: "ignore" } }));
    await setSeen(7, { "1": { section: 0, type: "forum" } });
    await resetCourseRules(7);
    expect(await getCourse(7)).toEqual({ ...emptyCourse(), name: "Nano", done: [1] });
    await removeCourse(7);
    expect(await getCourse(7)).toEqual(emptyCourse());
    expect(await getSeen(7)).toEqual({});
    expect(await listCourses()).toEqual([]);
  });

  it("mergeSeenSections keeps the section of an item cached under a section that is not on the page", async () => {
    // A subsection's own page shows its items under the subsection's number (15), the state service files them under the parent (3).
    await setSeen(7, { "1": { section: 3, type: "resource" } });
    const next = await mergeSeenSections(7, [15], [{ cmid: 1, type: "resource", section: 15 }, { cmid: 2, type: "lti", section: 15 }]);
    expect(next).toEqual({ "1": { section: 3, type: "resource" }, "2": { section: 15, type: "lti" } });
  });
});

describe("large courses", () => {
  const many = Array.from({ length: 2000 }, (_, i) => 4_000_000 + i);
  const overrides = Object.fromEntries(many.slice(0, 600).map((id) => [String(id), "ignore" as const]));
  const big = { ...emptyCourse(), name: "Big", done: many, itemOverrides: overrides, typeRules: { url: "ignore" as const } };
  const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

  it("splits a course that would exceed the sync item limit and reads it back whole", async () => {
    await updateCourse(7, () => big);
    const raw = await storage.snapshot("sync");
    const keys = Object.keys(raw).filter((k) => k.startsWith("course:7"));
    expect(keys.length).toBeGreaterThan(2);
    for (const k of keys) expect(k.length + bytes(raw[k])).toBeLessThan(8192);
    expect(await getCourse(7)).toEqual(big);
    expect(await listCourses()).toEqual([{ id: 7, data: big }]);
  });

  it("notifies watchers when only a part changed", async () => {
    await updateCourse(7, () => big);
    const onCourse = vi.fn();
    const stop = watchCourse(7, onCourse);
    await updateCourse(7, (c) => ({ ...c, done: c.done.slice(0, -1) }));
    await new Promise((r) => setTimeout(r, 0));
    expect(onCourse).toHaveBeenLastCalledWith(expect.objectContaining({ done: many.slice(0, -1) }));
    stop();
  });

  it("drops the parts again when the course shrinks or is removed", async () => {
    await updateCourse(7, () => big);
    await updateCourse(7, (c) => ({ ...c, done: [1], itemOverrides: {} }));
    expect(Object.keys(await storage.snapshot("sync")).filter((k) => k.startsWith("course:7"))).toEqual(["course:7"]);
    expect(await getCourse(7)).toEqual({ ...big, done: [1], itemOverrides: {} });

    await updateCourse(7, () => big);
    await removeCourse(7);
    expect(Object.keys(await storage.snapshot("sync")).filter((k) => k.startsWith("course:7"))).toEqual([]);
    expect(await listCourses()).toEqual([]);
  });
});
