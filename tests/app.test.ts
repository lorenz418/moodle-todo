import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { App } from "../src/app";
import { parsePage } from "../src/parse/page";
import { getCourse, getGlobal, getSeen, setSeen, updateCourse } from "../src/storage/store";
import { loadPage } from "./fixtures";

function stateResponse(cms: Array<{ id: number; module: string; sectionid: number }>, sections: Array<{ id: number; number: number }>) {
  return new Response(JSON.stringify([{ error: false, data: JSON.stringify({ cm: cms, section: sections }) }]), { status: 200 });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders checkboxes, stores the course name and the seen cache from the state service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => stateResponse(
      [{ id: 3979856, module: "resource", sectionid: 11 }, { id: 3985853, module: "lti", sectionid: 11 }, { id: 777, module: "resource", sectionid: 12 }],
      [{ id: 11, number: 1 }, { id: 12, number: 9 }],
    )));
    const doc = loadPage("nano");
    const page = parsePage(doc)!;
    const app = new App(doc, page, { isCoursePage: true, origin: "https://www.moodle.tum.de" });
    await app.start();

    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(8);
    expect((await getCourse(120985)).name).toBe("Nanotechnologie");
    expect(await getSeen(120985)).toEqual({
      "3979856": { section: 1, type: "resource" },
      "3985853": { section: 1, type: "lti" },
      "777": { section: 9, type: "resource" },
    });
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("0 / 3 done");
    expect(doc.querySelector(".mtd-progress")!.textContent).not.toContain("unavailable");
  });

  it("falls back to page items when the state call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await setSeen(120985, { "555": { section: 15, type: "resource" } });
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    const seen = await getSeen(120985);
    expect(Object.keys(seen)).toHaveLength(10);
    expect(seen["555"]).toBeUndefined(); // section 15 is on the page (all weeks are), so it was replaced
    expect(doc.querySelector(".mtd-progress")!.textContent).toContain("Course state unavailable");
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("0 / 8 done");
  });

  it("does not store the course name from a section page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: false, origin: "https://x" });
    await app.start();
    expect((await getCourse(120985)).name).toBe("");
  });

  it("persists checkbox changes optimistically and reacts to external storage changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    const li = doc.getElementById("module-3979856")!;
    const box = li.querySelector<HTMLInputElement>(".mtd-checkbox")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(li.classList.contains("mtd-done")).toBe(true); // immediate
    await flush();
    expect((await getCourse(120985)).done).toEqual([3979856]);
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("1 / 8 done");

    // another tab marks a second item done
    await updateCourse(120985, (c) => ({ ...c, done: [...c.done, 3985853] }));
    await flush();
    expect(doc.getElementById("module-3985853")!.classList.contains("mtd-done")).toBe(true);
    expect(doc.querySelector(".mtd-progress-text")!.textContent).toBe("2 / 8 done");
  });

  it("reverts the optimistic change and shows a message when the write fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    vi.spyOn(fakeBrowser.storage.sync, "set").mockRejectedValueOnce(new Error("QUOTA_BYTES_PER_ITEM exceeded"));
    const li = doc.getElementById("module-3979856")!;
    const box = li.querySelector<HTMLInputElement>(".mtd-checkbox")!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(li.classList.contains("mtd-done")).toBe(true);
    await flush();
    expect(li.classList.contains("mtd-done")).toBe(false);
    expect(box.checked).toBe(false);
    expect(doc.querySelector(".mtd-progress-message")!.textContent).toContain("Could not save");
    expect((await getCourse(120985)).done).toEqual([]);
  });

  it("applies menu actions to the right storage area", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const doc = loadPage("nano");
    const app = new App(doc, parsePage(doc)!, { isCoursePage: true, origin: "https://x" });
    await app.start();

    const li = doc.getElementById("module-3979856")!;
    li.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.click();
    const items = li.querySelectorAll<HTMLButtonElement>(".mtd-menu-item");
    items[2]!.click(); // Ignore all File everywhere
    await flush();
    expect((await getGlobal()).typeRules.resource).toBe("ignore");
    expect(li.classList.contains("mtd-ignored")).toBe(true);
    expect(doc.querySelectorAll(".mtd-checkbox")).toHaveLength(4); // the 4 lti recordings remain

    li.querySelector<HTMLButtonElement>(".mtd-menu-btn")!.click();
    li.querySelectorAll<HTMLButtonElement>(".mtd-menu-item")[1]!.click(); // Track all File in this course
    await flush();
    expect((await getCourse(120985)).typeRules.resource).toBe("track");
    expect(li.classList.contains("mtd-ignored")).toBe(false);
  });
});
