import { fetchCourseState } from "./moodle/state";
import { computeProgress, type CourseProgress } from "./model/progress";
import { applyMenuAction, setGlobalTypeRule, toggleDone } from "./model/rules";
import {
  getCourse, getGlobal, mergeSeenSections, setSeen, updateCourse, updateCourseWithGlobal, updateGlobal, watchCourse, watchGlobal,
} from "./storage/store";
import type { CourseData, GlobalData, Layer, ParsedPage, Rule, RuleItem, SeenCache } from "./types";
import { DEFAULT_GLOBAL, emptyCourse } from "./types";
import { installHandlers, render } from "./ui/render";

export interface AppOptions {
  /** True on course/view.php, where the h1 is the course name. */
  isCoursePage: boolean;
  origin: string;
  /** Aborted when the extension context is invalidated; removes the DOM handlers. */
  signal?: AbortSignal;
}

const TAG = "[moodle-todo]";

export class App {
  private course: CourseData = emptyCourse();
  private global: GlobalData = DEFAULT_GLOBAL;
  private seen: SeenCache | null = null;
  private fallback = false;
  private message: string | null = null;
  private invalidated = false;
  private unwatchers: Array<() => void> = [];

  constructor(
    private readonly doc: Document,
    private readonly page: ParsedPage,
    private readonly options: AppOptions,
  ) {}

  async start(): Promise<void> {
    const { courseId } = this.page;
    installHandlers(this.doc, {
      onToggleDone: (cmid, done) => this.handleToggleDone(cmid, done),
      onMenuAction: (layer, value, item) => this.handleMenuAction(layer, value, item),
    }, this.options.signal);

    // Register watchers first so changes made during the initial load are not missed.
    this.unwatchers.push(
      watchGlobal((g) => { this.global = g; this.render(); }),
      watchCourse(courseId, (c) => { this.course = c; this.render(); }),
    );

    [this.global, this.course] = await Promise.all([getGlobal(), getCourse(courseId)]);
    if (this.options.isCoursePage && this.page.courseName && this.course.name !== this.page.courseName) {
      const name = this.page.courseName;
      this.course = { ...this.course, name };
      updateCourse(courseId, (c) => ({ ...c, name })).catch((err: unknown) => {
        console.warn(`${TAG} could not store course name`, err);
      });
    }
    this.render();

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
    const { courseId, sesskey, sections } = this.page;
    const state = await fetchCourseState(courseId, sesskey, this.options.origin);
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
    const items = sections.flatMap((s) => s.items.map((i) => ({ cmid: i.cmid, type: i.type, section: s.num })));
    try {
      this.seen = await mergeSeenSections(courseId, sections.map((s) => s.num), items);
    } catch (err) {
      console.warn(`${TAG} could not store seen cache`, err);
      const seen: SeenCache = {};
      for (const i of items) seen[String(i.cmid)] = { section: i.section, type: i.type };
      this.seen = seen;
    }
  }

  private render(): void {
    const progress: CourseProgress | null = this.seen ? computeProgress(this.seen, this.course, this.global) : null;
    render(this.doc, {
      page: this.page,
      course: this.course,
      global: this.global,
      progress,
      fallback: this.fallback,
      message: this.message,
      disabled: this.invalidated,
    });
  }

  private handleToggleDone(cmid: number, done: boolean): void {
    if (this.invalidated) return;
    this.course = toggleDone(this.course, cmid, done);
    this.message = null;
    this.render();
    updateCourse(this.page.courseId, (c) => toggleDone(c, cmid, done)).catch((err: unknown) => {
      console.warn(`${TAG} could not save`, err);
      this.course = toggleDone(this.course, cmid, !done);
      // Keep the "reload the page" message if the context was invalidated meanwhile.
      if (!this.invalidated) this.message = "Could not save, please try again";
      this.render();
    });
  }

  private handleMenuAction(layer: Layer, value: Rule, item: RuleItem): void {
    if (this.invalidated) return;
    const optimistic = applyMenuAction(layer, value, item, this.course, this.global);
    const previous = { course: this.course, global: this.global };
    this.course = optimistic.course;
    this.global = optimistic.global;
    this.message = null;
    this.render();

    const write =
      layer === "global"
        ? updateGlobal((g) => setGlobalTypeRule(g, item.type, value))
        : updateCourseWithGlobal(this.page.courseId, (c, g) => applyMenuAction(layer, value, item, c, g).course);

    write.catch(async (err: unknown) => {
      console.warn(`${TAG} could not save`, err);
      // Restore from storage rather than the click-time snapshot, which may predate newer writes.
      try {
        [this.global, this.course] = await Promise.all([getGlobal(), getCourse(this.page.courseId)]);
      } catch {
        this.course = previous.course;
        this.global = previous.global;
      }
      if (!this.invalidated) this.message = "Could not save, please try again";
      this.render();
    });
  }
}
