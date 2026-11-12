import { fetchCourseState } from "./moodle/state";
import { computeProgress, itemsProgress, type CourseProgress } from "./model/progress";
import { applyMenuAction, setGlobalTypeRule, toggleDone } from "./model/rules";
import { courseNameFromTitle, parsePage } from "./parse/page";
import {
  getCourse, getGlobal, getSeen, mergeSeenSections, setSeen, updateCourse, updateCourseWithGlobal, updateGlobal, watchCourse, watchGlobal,
} from "./storage/store";
import type { CourseData, GlobalData, Layer, ParsedPage, Rule, RuleItem, SeenCache } from "./types";
import { DEFAULT_GLOBAL, emptyCourse } from "./types";
import { countUncontrolled, installHandlers, render } from "./ui/render";

export interface AppOptions {
  /** True on course/view.php, where the h1 is the course name. */
  isCoursePage: boolean;
  origin: string;
  /** Aborted when the extension context is invalidated; removes the DOM handlers. */
  signal?: AbortSignal;
}

const TAG = "[moodle-todo]";
/** Moodle re-renders in bursts; wait for the burst to end before repairing. */
const REPAIR_DELAY_MS = 50;

type Sections = ParsedPage["sections"];

/** Adds page items the cache is missing, so every visible checkbox counts. */
function addPageItems(seen: SeenCache, sections: Sections): SeenCache {
  const merged: SeenCache = { ...seen };
  for (const s of sections) for (const i of s.items) merged[String(i.cmid)] ??= { section: s.num, type: i.type };
  return merged;
}

/**
 * Validates a state response against the page. A response that shares no item
 * with a non-empty page is treated as unusable (most likely a field-name
 * mismatch) and returns null.
 */
function withPageItems(state: SeenCache | null, sections: Sections): SeenCache | null {
  if (!state) return null;
  const keys = sections.flatMap((s) => s.items.map((i) => String(i.cmid)));
  if (keys.length > 0 && !keys.some((key) => key in state)) {
    console.warn(`${TAG} course state does not match the page, ignoring it`);
    return null;
  }
  return addPageItems(state, sections);
}

export class App {
  private page: ParsedPage;
  private course: CourseData = emptyCourse();
  private global: GlobalData = DEFAULT_GLOBAL;
  private seen: SeenCache | null = null;
  private fallback = false;
  private message: string | null = null;
  private invalidated = false;
  private unwatchers: Array<() => void> = [];
  /** Writes that have not settled yet. While one is open, the optimistic state wins over storage events. */
  private pending = { course: 0, global: 0 };
  private courseName = "";
  /** Activities without controls that a re-parse could not fix; avoids repairing them forever. */
  private unfixable = 0;

  constructor(
    private readonly doc: Document,
    page: ParsedPage,
    private readonly options: AppOptions,
  ) {
    this.page = page;
  }

  async start(): Promise<void> {
    const { courseId } = this.page;
    installHandlers(this.doc, {
      onToggleDone: (cmid, done) => this.handleToggleDone(cmid, done),
      onMenuAction: (layer, value, item) => this.handleMenuAction(layer, value, item),
    }, this.options.signal);

    // Register watchers first so changes made during the initial load are not missed.
    this.unwatchers.push(
      watchGlobal((g) => {
        if (this.pending.global > 0) return;
        this.global = g;
        this.render();
      }),
      watchCourse(courseId, (c) => {
        if (this.pending.course > 0) return;
        this.course = c;
        this.render();
      }),
    );

    const [global, course, cached] = await Promise.all([
      getGlobal(),
      getCourse(courseId),
      getSeen(courseId).catch((): SeenCache => ({})),
    ]);
    this.global = global;
    this.course = course;
    this.courseName = this.options.isCoursePage ? this.page.courseName : courseNameFromTitle(this.doc);
    if (this.courseName && this.course.name !== this.courseName) {
      const name = this.courseName;
      this.course = { ...this.course, name };
      updateCourse(courseId, (c) => ({ ...c, name })).catch((err: unknown) => {
        console.warn(`${TAG} could not store course name`, err);
      });
    }
    // Show the counts from the last visit right away; the state call below refreshes them.
    if (Object.keys(cached).length > 0) this.seen = addPageItems(cached, this.page.sections);
    this.render();
    this.unfixable = countUncontrolled(this.doc);
    this.watchDom();

    await this.loadSeen();
    this.render();
  }

  /** Called when the extension context is gone: stop listening and tell the user. */
  invalidate(): void {
    this.invalidated = true;
    for (const unwatch of this.unwatchers) {
      try { unwatch(); } catch { /* context already gone */ }
    }
    this.unwatchers = [];
    this.message = "Extension was updated, reload the page to keep saving";
    this.render();
  }

  private async loadSeen(): Promise<void> {
    const { courseId, sesskey } = this.page;
    const state = withPageItems(await fetchCourseState(courseId, sesskey, this.options.origin), this.page.sections);
    if (state) {
      this.seen = state;
      this.fallback = false;
      this.render(); // do not hold the UI back on the best-effort write
      try {
        await setSeen(courseId, state);
      } catch (err) {
        console.warn(`${TAG} could not store seen cache`, err);
      }
      return;
    }
    console.warn(`${TAG} course state unavailable, using page items only`);
    this.fallback = true;
    const { sections } = this.page;
    const items = sections.flatMap((s) => s.items.map((i) => ({ cmid: i.cmid, type: i.type, section: s.num })));
    try {
      this.seen = await mergeSeenSections(courseId, sections.map((s) => s.num), items);
    } catch (err) {
      console.warn(`${TAG} could not store seen cache`, err);
      this.seen = addPageItems(this.seen ?? {}, sections);
    }
  }

  /**
   * Moodle replaces activity and section nodes without a page load (edit mode,
   * AJAX refreshes). When controls went missing, parse the page again and render.
   */
  private watchDom(): void {
    if (typeof MutationObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        if (!this.invalidated) this.repair();
      }, REPAIR_DELAY_MS);
    });
    observer.observe(this.doc.querySelector(".course-content") ?? this.doc.body, { childList: true, subtree: true });
    this.unwatchers.push(() => observer.disconnect());
    this.options.signal?.addEventListener("abort", () => observer.disconnect());
  }

  private repair(): void {
    const stale = this.page.sections.some(
      (s) => (s.headingEl !== null && !s.headingEl.isConnected) || s.items.some((i) => !i.el.isConnected),
    );
    if (!stale && countUncontrolled(this.doc) === this.unfixable) return;
    const page = parsePage(this.doc);
    if (!page) return;
    this.page = page;
    if (this.seen) this.seen = addPageItems(this.seen, page.sections);
    this.render();
    this.unfixable = countUncontrolled(this.doc);
  }

  private render(): void {
    render(this.doc, {
      page: this.page,
      course: this.course,
      global: this.global,
      progress: this.progress(),
      fallback: this.fallback,
      message: this.message,
      disabled: this.invalidated,
    });
  }

  private progress(): CourseProgress | null {
    if (!this.seen) return null;
    const progress = computeProgress(this.seen, this.course, this.global);
    // On a subsection's own page the cache files its items under the parent
    // section, so the heading would get no badge. Count such a section from the page.
    for (const section of this.page.sections) {
      if (section.items.length === 0 || progress.sections.has(section.num)) continue;
      const own = itemsProgress(section.items, this.course, this.global);
      if (own.total > 0) progress.sections.set(section.num, own);
    }
    return progress;
  }

  /** A course entry recreated after "Clear all", or first written from a section page, still gets its name. */
  private named(course: CourseData): CourseData {
    return course.name || !this.courseName ? course : { ...course, name: this.courseName };
  }

  /**
   * Follows a write through. The optimistic state stays on screen until the
   * last open write of its kind settles, then the stored value replaces it.
   * `revert` is only used when storage cannot be read after a failure.
   */
  private track(kind: "course" | "global", write: Promise<CourseData | GlobalData>, revert: () => void): void {
    this.pending[kind]++;
    write.then(
      (stored) => {
        if (--this.pending[kind] > 0) return;
        if (kind === "course") this.course = stored as CourseData;
        else this.global = stored as GlobalData;
        this.render();
      },
      async (err: unknown) => {
        this.pending[kind]--;
        console.warn(`${TAG} could not save`, err);
        // Keep the "reload the page" message if the context was invalidated meanwhile.
        if (!this.invalidated) this.message = "Could not save, please try again";
        try {
          const [global, course] = await Promise.all([getGlobal(), getCourse(this.page.courseId)]);
          if (this.pending.global === 0) this.global = global;
          if (this.pending.course === 0) this.course = course;
        } catch {
          revert();
        }
        this.render();
      },
    );
  }

  private handleToggleDone(cmid: number, done: boolean): void {
    if (this.invalidated) return;
    this.course = toggleDone(this.course, cmid, done);
    this.message = null;
    this.render();
    this.track(
      "course",
      updateCourse(this.page.courseId, (c) => this.named(toggleDone(c, cmid, done))),
      () => { this.course = toggleDone(this.course, cmid, !done); },
    );
  }

  private handleMenuAction(layer: Layer, value: Rule, item: RuleItem): void {
    if (this.invalidated) return;
    const previous = { course: this.course, global: this.global };
    const optimistic = applyMenuAction(layer, value, item, this.course, this.global);
    this.course = optimistic.course;
    this.global = optimistic.global;
    this.message = null;
    this.render();

    const revert = (): void => {
      this.course = previous.course;
      this.global = previous.global;
    };
    if (layer === "global") {
      this.track("global", updateGlobal((g) => setGlobalTypeRule(g, item.type, value)), revert);
    } else {
      this.track(
        "course",
        updateCourseWithGlobal(this.page.courseId, (c, g) => this.named(applyMenuAction(layer, value, item, c, g).course)),
        revert,
      );
    }
  }
}
