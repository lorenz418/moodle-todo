// TODO(spike): confirm field names against examples/course-state-125111.json
import type { SeenCache } from "../types";

export const STATE_TIMEOUT_MS = 10_000;

const SKIPPED_MODULES = new Set(["label", "subsection"]);

interface RawCm {
  id: number;
  module: string;
  sectionid: number;
}

interface RawSection {
  id: number;
  number: number;
  /** Set on delegated sections (e.g. "mod_subsection"). */
  component?: string | null;
  /** For delegated sections: the cmid of the owning subsection activity. */
  itemid?: number | null;
}

interface RawState {
  cm: RawCm[];
  section: RawSection[];
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

    const sectionById = new Map(state.section.map((s) => [s.id, s]));
    const cmById = new Map(state.cm.map((c) => [c.id, c]));

    /** Section number of the top-level section that (transitively) contains `sectionId`. */
    const topLevelNumber = (sectionId: number, depth = 0): number | null => {
      const section = sectionById.get(sectionId);
      if (!section) return null;
      if (section.component && section.itemid != null && depth < 5) {
        const owner = cmById.get(section.itemid);
        if (owner) return topLevelNumber(owner.sectionid, depth + 1);
      }
      return typeof section.number === "number" ? section.number : null;
    };

    const seen: SeenCache = {};
    for (const cm of state.cm) {
      if (typeof cm.id !== "number" || typeof cm.module !== "string") continue;
      if (SKIPPED_MODULES.has(cm.module)) continue;
      const section = topLevelNumber(cm.sectionid);
      if (section === null) continue;
      seen[String(cm.id)] = { section, type: cm.module };
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
