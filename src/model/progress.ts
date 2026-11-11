import type { CourseData, GlobalData, SeenCache } from "../types";
import { resolveState } from "./rules";

export interface Progress {
  done: number;
  total: number;
}

export interface CourseProgress {
  course: Progress;
  /** Keyed by section number. Sections with no tracked items are absent. */
  sections: Map<number, Progress>;
}

export function computeProgress(seen: SeenCache, course: CourseData, global: GlobalData): CourseProgress {
  const sections = new Map<number, Progress>();
  const total: Progress = { done: 0, total: 0 };
  for (const [key, info] of Object.entries(seen)) {
    const state = resolveState({ cmid: Number(key), type: info.type }, course, global);
    if (state === "ignored") continue;
    const section = sections.get(info.section) ?? { done: 0, total: 0 };
    section.total += 1;
    total.total += 1;
    if (state === "done") {
      section.done += 1;
      total.done += 1;
    }
    sections.set(info.section, section);
  }
  return { course: total, sections };
}
