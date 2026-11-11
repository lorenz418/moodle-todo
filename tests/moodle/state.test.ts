import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCourseState, parseCourseState, STATE_TIMEOUT_MS } from "../../src/moodle/state";

/** Builds a service response in the double-encoded shape Moodle returns. */
function response(state: unknown) {
  return [{ error: false, data: JSON.stringify(state) }];
}

const sampleState = {
  course: { id: 42 },
  section: [
    { id: 100, number: 0 },
    { id: 101, number: 1 },
    { id: 150, number: 5, component: "mod_subsection", itemid: 9 },
  ],
  cm: [
    { id: 1, module: "forum", sectionid: 100 },
    { id: 2, module: "label", sectionid: 101 },
    { id: 3, module: "resource", sectionid: 101 },
    { id: 9, module: "subsection", sectionid: 101 },
    { id: 4, module: "url", sectionid: 150 },
    { id: 5, module: "resource", sectionid: 101, uservisible: false },
  ],
};

describe("parseCourseState", () => {
  it("maps cms to the seen-cache shape, dropping labels, subsections and invisible cms", () => {
    expect(parseCourseState(response(sampleState))).toEqual({
      "1": { section: 0, type: "forum" },
      "3": { section: 1, type: "resource" },
      "4": { section: 1, type: "url" },
    });
  });

  it("returns null on error responses and malformed input", () => {
    expect(parseCourseState([{ error: true, exception: { message: "nope" } }])).toBeNull();
    expect(parseCourseState([{ error: false, data: "not json" }])).toBeNull();
    expect(parseCourseState([{ error: false, data: JSON.stringify({ cm: "x" }) }])).toBeNull();
    expect(parseCourseState(null)).toBeNull();
    expect(parseCourseState("")).toBeNull();
  });

  const spikeFile = join(__dirname, "..", "..", "examples", "course-state-125111.json");
  it.skipIf(!existsSync(spikeFile))("parses the real TUM response for course 125111", () => {
    const seen = parseCourseState(JSON.parse(readFileSync(spikeFile, "utf8")));
    expect(seen).not.toBeNull();
    const entries = Object.values(seen!);
    expect(entries.length).toBeGreaterThan(10);
    // Items known from the saved onetopic pages: Problem sheet 1 (section 4), Fluid Properties recording (section 6).
    expect(seen!["3957904"]).toEqual({ section: 4, type: "resource" });
    expect(seen!["3957930"]).toEqual({ section: 6, type: "lti" });
    expect(entries.some((e) => e.type === "label")).toBe(false);
  });
});

describe("fetchCourseState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns null without a sesskey and does not call fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchCourseState(42, null, "https://www.moodle.tum.de")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the expected request and parses the response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response(sampleState)), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const seen = await fetchCourseState(42, "abc", "https://www.moodle.tum.de");
    expect(seen).toEqual(parseCourseState(response(sampleState)));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.moodle.tum.de/lib/ajax/service.php?sesskey=abc&info=core_courseformat_get_state");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual([
      { index: 0, methodname: "core_courseformat_get_state", args: { courseid: 42 } },
    ]);
  });

  it("returns null on non-200 and on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    expect(await fetchCourseState(42, "abc", "https://x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await fetchCourseState(42, "abc", "https://x")).toBeNull();
  });

  it("aborts after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    ));
    const pending = fetchCourseState(42, "abc", "https://x");
    await vi.advanceTimersByTimeAsync(STATE_TIMEOUT_MS + 1);
    expect(await pending).toBeNull();
  });
});
