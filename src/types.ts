export type Rule = "ignore" | "track";
export type ItemState = "open" | "done" | "ignored";
export type Layer = "item" | "course" | "global";

export interface GlobalData {
  typeRules: Record<string, Rule>;
}

export interface CourseData {
  name: string;
  done: number[];
  /** Keyed by String(cmid). */
  itemOverrides: Record<string, Rule>;
  typeRules: Record<string, Rule>;
}

/** Keyed by String(cmid). */
export type SeenCache = Record<string, { section: number; type: string }>;

export interface RuleItem {
  cmid: number;
  type: string;
}

export interface ParsedItem extends RuleItem {
  name: string;
  el: HTMLElement;
}

export interface ParsedSection {
  num: number;
  name: string;
  headingEl: HTMLElement | null;
  items: ParsedItem[];
}

export interface ParsedTab {
  num: number;
  el: HTMLAnchorElement;
}

export interface ParsedPage {
  courseId: number;
  courseName: string;
  format: string;
  sesskey: string | null;
  sections: ParsedSection[];
  /** Present on onetopic (tab) courses, otherwise null. */
  tabs: ParsedTab[] | null;
}

/** Module types that are page furniture, never tasks. Used by the page parser and the state parser alike. */
export const NON_TASK_TYPES: ReadonlySet<string> = new Set(["label", "subsection"]);

export const DEFAULT_GLOBAL: GlobalData = {
  typeRules: { forum: "ignore", choice: "ignore" },
};

export function emptyCourse(): CourseData {
  return { name: "", done: [], itemOverrides: {}, typeRules: {} };
}
