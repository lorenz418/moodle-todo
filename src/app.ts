import { fetchCourseState } from "./moodle/state";
import { computeProgress, type CourseProgress } from "./model/progress";
import { applyMenuAction, toggleDone } from "./model/rules";
import {
  getCourse, getGlobal, mergeSeenSections, setSeen, updateCourse, updateGlobal, watchCourse, watchGlobal,
} from "./storage/store";
import type { CourseData, GlobalData, Layer, ParsedPage, Rule, RuleItem, SeenCache } from "./types";
import { DEFAULT_GLOBAL, emptyCourse } from "./types";
import { installHandlers, render } from "./ui/render";

export interface AppOptions {
  /** True on course/view.php, where the h1 is the course name. */
  isCoursePage: boolean;
  origin: string;
}

const TAG = "[moodle-todo]";

export class App {
  private course: CourseData = emptyCourse();
  private global: GlobalData = DEFAULT_GLOBAL;
  private seen: SeenCache | null = null;
  private fallback = false;
  private message: string | null = null;

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
    });

    [this.global, this.course] = await Promise.all([getGlobal(), getCourse(courseId)]);
    if (this.options.isCoursePage && this.page.courseName && this.course.name !== this.page.courseName) {
      const name = this.page.courseName;
      this.course = await updateCourse(courseId, (c) => ({ ...c, name }));
    }
    this.render();

    watchGlobal((g) => { this.global = g; this.render(); });
    watchCourse(courseId, (c) => { this.course = c; this.render(); });

    await this.loadSeen();
    this.render();
  }

  private async loadSeen(): Promise<void> {
    const { courseId, sesskey, sections } = this.page;
    const state = await fetchCourseState(courseId, sesskey, this.options.origin);
    if (state) {
      this.seen = state;
      this.fallback = false;
      await setSeen(courseId, state);
      return;
    }
    console.warn(`${TAG} course state unavailable, using page items only`);
    this.fallback = true;
    this.seen = await mergeSeenSections(
      courseId,
      sections.map((s) => s.num),
      sections.flatMap((s) => s.items.map((i) => ({ cmid: i.cmid, type: i.type, section: s.num }))),
    );
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
    });
  }

  private handleToggleDone(cmid: number, done: boolean): void {
    this.course = toggleDone(this.course, cmid, done);
    this.message = null;
    this.render();
    updateCourse(this.page.courseId, (c) => toggleDone(c, cmid, done)).catch((err: unknown) => {
      console.warn(`${TAG} could not save`, err);
      this.course = toggleDone(this.course, cmid, !done);
      this.message = "Could not save, please try again";
      this.render();
    });
  }

  private handleMenuAction(layer: Layer, value: Rule, item: RuleItem): void {
    const optimistic = applyMenuAction(layer, value, item, this.course, this.global);
    const previous = { course: this.course, global: this.global };
    this.course = optimistic.course;
    this.global = optimistic.global;
    this.message = null;
    this.render();

    const write =
      layer === "global"
        ? updateGlobal((g) => applyMenuAction(layer, value, item, previous.course, g).global)
        : updateCourse(this.page.courseId, (c) => applyMenuAction(layer, value, item, c, previous.global).course);

    write.catch((err: unknown) => {
      console.warn(`${TAG} could not save`, err);
      this.course = previous.course;
      this.global = previous.global;
      this.message = "Could not save, please try again";
      this.render();
    });
  }
}
