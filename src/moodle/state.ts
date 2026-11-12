// Field names follow Moodle 4.x's core_courseformat state exporters; checked live against TUM Moodle.
import { NON_TASK_TYPES, type SeenCache } from "../types";

export const STATE_TIMEOUT_MS = 10_000;

/** Moodle's PHP exporters send ids as numbers or numeric strings depending on the version. */
type Id = number | string;

interface RawCm {
  id: Id;
  module: string;
  sectionid: Id;
}

interface RawSection {
  id: Id;
  /** Section number. Newer Moodle sends `number`, older `section`. */
  number?: Id;
  section?: Id;
  /** Set on delegated sections (e.g. "mod_subsection"). */
  component?: string | null;
  /** For delegated sections: the cmid of the owning subsection activity. */
  itemid?: Id | null;
}

interface RawState {
  cm: RawCm[];
  section: RawSection[];
}

/** A non-negative integer from a number or numeric string, otherwise null. */
function toInt(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/**
 * Converts a core_courseformat_get_state response into the seen-cache shape.
 * Returns null for error responses or anything that does not look like a state.
 */
export function parseCourseState(body: unknown): SeenCache | null {
  try {
    const first = Array.isArray(body) ? body[0] : body;
    if (!first || typeof first !== "object" || (first as { error?: unknown }).error) return null;
    const raw = (first as { data?: unknown }).data;
    const state = (typeof raw === "string" ? JSON.parse(raw) : raw) as RawState | undefined;
    if (!state || !Array.isArray(state.cm) || !Array.isArray(state.section)) return null;

    const sectionById = new Map<number, RawSection>();
    for (const s of state.section) {
      const id = toInt(s.id);
      if (id !== null) sectionById.set(id, s);
    }
    const cmById = new Map<number, RawCm>();
    for (const c of state.cm) {
      const id = toInt(c.id);
      if (id !== null) cmById.set(id, c);
    }

    /** Section number of the top-level section that (transitively) contains `sectionId`. */
    const topLevelNumber = (sectionId: number | null, depth = 0): number | null => {
      if (sectionId === null) return null;
      const section = sectionById.get(sectionId);
      if (!section) return null;
      const owner = section.component ? cmById.get(toInt(section.itemid) ?? -1) : undefined;
      if (owner && depth < 5) return topLevelNumber(toInt(owner.sectionid), depth + 1);
      return toInt(section.number ?? section.section);
    };

    const seen: SeenCache = {};
    for (const cm of state.cm) {
      const id = toInt(cm.id);
      if (id === null || typeof cm.module !== "string" || NON_TASK_TYPES.has(cm.module)) continue;
      const section = topLevelNumber(toInt(cm.sectionid));
      if (section === null) continue;
      seen[String(id)] = { section, type: cm.module };
    }
    return seen;
  } catch {
    return null;
  }
}

/**
 * Calls Moodle's course state service. Returns null on any failure so the
 * caller can fall back to page parsing. Never throws.
 */
export async function fetchCourseState(
  courseId: number,
  sesskey: string | null,
  origin: string = location.origin,
): Promise<SeenCache | null> {
  if (!sesskey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATE_TIMEOUT_MS);
  try {
    const url = `${origin}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=core_courseformat_get_state`;
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ index: 0, methodname: "core_courseformat_get_state", args: { courseid: courseId } }]),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseCourseState(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
