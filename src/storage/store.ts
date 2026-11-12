import { storage, type StorageItemKey } from "wxt/utils/storage";
import { DEFAULT_GLOBAL, emptyCourse, type CourseData, type GlobalData, type Rule, type SeenCache } from "../types";

const GLOBAL_KEY = "sync:global" as const;
const COURSE_PREFIX = "course:";
const SEEN_PREFIX = "seen:";

const courseKey = (id: number): StorageItemKey => `sync:${COURSE_PREFIX}${id}`;
const partName = (id: number, n: number): string => `${COURSE_PREFIX}${id}~${n}`;
const partKey = (id: number, n: number): StorageItemKey => `sync:${partName(id, n)}`;

/**
 * chrome.storage.sync rejects items over 8192 bytes. A course that grows past
 * ITEM_BUDGET keeps its name and type rules in the main item and moves `done`
 * and `itemOverrides` into numbered part items (`course:<id>~<n>`).
 */
const ITEM_BUDGET = 7000;
const DONE_PER_PART = 600;
const OVERRIDES_PER_PART = 250;

interface StoredCourse extends Partial<CourseData> {
  /** Number of part items. Absent while the course fits into one item. */
  parts?: number;
  /** Bumped on every split write, so watchers of the main item also see changes that only touch a part. */
  rev?: number;
}

interface CoursePart {
  done?: number[];
  itemOverrides?: Record<string, Rule>;
}
const seenKey = (id: number): StorageItemKey => `local:${SEEN_PREFIX}${id}`;

export interface SeenInput {
  cmid: number;
  type: string;
  section: number;
}

/**
 * Serializes read-modify-write operations so back-to-back updates in one tab never drop each other.
 * A queued operation must never await another queued function (it would deadlock).
 */
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const p = queue.then(op);
  queue = p.catch(() => {});
  return p;
}

/** Fills in missing fields so a malformed or partial stored object cannot break rule resolution. */
function normalizeGlobal(stored: Partial<GlobalData> | null | undefined): GlobalData {
  if (!stored) return DEFAULT_GLOBAL;
  return { ...stored, typeRules: { ...(stored.typeRules ?? DEFAULT_GLOBAL.typeRules) } };
}

function normalizeCourse(stored: StoredCourse | null | undefined, parts: Array<CoursePart | null | undefined> = []): CourseData {
  const { parts: _parts, rev: _rev, ...main } = stored ?? {};
  const course = { ...emptyCourse(), ...main };
  if (parts.length === 0) return course;
  const done = [...course.done];
  const itemOverrides = { ...course.itemOverrides };
  for (const part of parts) {
    if (part?.done) done.push(...part.done);
    if (part?.itemOverrides) Object.assign(itemOverrides, part.itemOverrides);
  }
  return { ...course, done, itemOverrides };
}

interface CourseRecord {
  course: CourseData;
  parts: number;
  rev: number;
}

async function readCourse(id: number): Promise<CourseRecord> {
  const main = await storage.getItem<StoredCourse>(courseKey(id));
  const parts = main?.parts ?? 0;
  const rev = main?.rev ?? 0;
  if (!main || parts === 0) return { course: normalizeCourse(main), parts: 0, rev };
  const items = await storage.getItems(Array.from({ length: parts }, (_, n) => partKey(id, n)));
  return { course: normalizeCourse(main, items.map((i) => i.value as CoursePart | null)), parts, rev };
}

function splitCourse(course: CourseData): CoursePart[] {
  const parts: CoursePart[] = [];
  for (let i = 0; i < course.done.length; i += DONE_PER_PART) parts.push({ done: course.done.slice(i, i + DONE_PER_PART) });
  const overrides = Object.entries(course.itemOverrides);
  for (let i = 0; i < overrides.length; i += OVERRIDES_PER_PART) {
    parts.push({ itemOverrides: Object.fromEntries(overrides.slice(i, i + OVERRIDES_PER_PART)) });
  }
  return parts;
}

async function writeCourse(id: number, course: CourseData, previous: CourseRecord): Promise<void> {
  const fits = new TextEncoder().encode(JSON.stringify(course)).length <= ITEM_BUDGET;
  const parts = fits ? [] : splitCourse(course);
  if (fits) {
    await storage.setItem(courseKey(id), course);
  } else {
    const main: StoredCourse = { ...course, done: [], itemOverrides: {}, parts: parts.length, rev: previous.rev + 1 };
    await storage.setItems([
      { key: courseKey(id), value: main },
      ...parts.map((value, n) => ({ key: partKey(id, n), value })),
    ]);
  }
  const stale = Array.from({ length: Math.max(0, previous.parts - parts.length) }, (_, n) => partKey(id, parts.length + n));
  if (stale.length > 0) await storage.removeItems(stale);
}

export async function getGlobal(): Promise<GlobalData> {
  return normalizeGlobal(await storage.getItem<GlobalData>(GLOBAL_KEY));
}

export function updateGlobal(fn: (g: GlobalData) => GlobalData): Promise<GlobalData> {
  return serialized(async () => {
    const next = fn(await getGlobal());
    await storage.setItem(GLOBAL_KEY, next);
    return next;
  });
}

export async function getCourse(id: number): Promise<CourseData> {
  return (await readCourse(id)).course;
}

export function updateCourse(id: number, fn: (c: CourseData) => CourseData): Promise<CourseData> {
  return serialized(async () => {
    const previous = await readCourse(id);
    const next = fn(previous.course);
    await writeCourse(id, next, previous);
    return next;
  });
}

/** Like updateCourse, but hands `fn` the global data as it is at write time. */
export function updateCourseWithGlobal(
  id: number,
  fn: (c: CourseData, g: GlobalData) => CourseData,
): Promise<CourseData> {
  return serialized(async () => {
    const previous = await readCourse(id);
    const next = fn(previous.course, await getGlobal());
    await writeCourse(id, next, previous);
    return next;
  });
}

export async function getSeen(id: number): Promise<SeenCache> {
  return (await storage.getItem<SeenCache>(seenKey(id))) ?? {};
}

export function setSeen(id: number, seen: SeenCache): Promise<void> {
  return serialized(() => storage.setItem(seenKey(id), seen));
}

/**
 * Fallback mode: replace the cached entries of `sectionNums` with `items`, keep other sections.
 * An item already cached under a section that is not on this page keeps that section: on a
 * subsection's own page the items belong to the parent section, which only the state service knows.
 */
export function mergeSeenSections(id: number, sectionNums: number[], items: SeenInput[]): Promise<SeenCache> {
  return serialized(async () => {
    const current = await getSeen(id);
    const replaced = new Set(sectionNums);
    const next: SeenCache = {};
    for (const [key, info] of Object.entries(current)) {
      if (!replaced.has(info.section)) next[key] = info;
    }
    for (const item of items) {
      const cached = next[String(item.cmid)];
      next[String(item.cmid)] = { section: cached?.section ?? item.section, type: item.type };
    }
    await storage.setItem(seenKey(id), next);
    return next;
  });
}

export function watchGlobal(cb: (g: GlobalData) => void): () => void {
  return storage.watch<GlobalData>(GLOBAL_KEY, (value) => cb(normalizeGlobal(value)));
}

export function watchCourse(id: number, cb: (c: CourseData) => void): () => void {
  return storage.watch<StoredCourse>(courseKey(id), (value) => {
    if (!value?.parts) return cb(normalizeCourse(value));
    getCourse(id).then(cb, (err: unknown) => console.warn("[moodle-todo] could not read course parts", err));
  });
}

export async function listCourses(): Promise<Array<{ id: number; data: CourseData }>> {
  const all = await storage.snapshot("sync");
  const result: Array<{ id: number; data: CourseData }> = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(COURSE_PREFIX)) continue;
    const id = Number(key.slice(COURSE_PREFIX.length)); // NaN for part items ("course:7~0")
    if (!Number.isFinite(id) || !value) continue;
    const main = value as StoredCourse;
    const parts = Array.from({ length: main.parts ?? 0 }, (_, n) => all[partName(id, n)] as CoursePart | undefined);
    result.push({ id, data: normalizeCourse(main, parts) });
  }
  return result;
}

/** Every module type that appears in any seen cache or in the given rules. */
export async function listSeenTypes(global: GlobalData, courses: Array<{ data: CourseData }>): Promise<string[]> {
  const types = new Set<string>();
  const local = await storage.snapshot("local");
  for (const [key, value] of Object.entries(local)) {
    if (!key.startsWith(SEEN_PREFIX) || !value) continue;
    for (const info of Object.values(value as SeenCache)) types.add(info.type);
  }
  for (const t of Object.keys(global.typeRules)) types.add(t);
  for (const { data } of courses) for (const t of Object.keys(data.typeRules)) types.add(t);
  return [...types];
}

export async function resetCourseRules(id: number): Promise<void> {
  await updateCourse(id, (c) => ({ ...c, itemOverrides: {}, typeRules: {} }));
}

export async function removeCourse(id: number): Promise<void> {
  await serialized(async () => {
    const { parts } = await readCourse(id);
    await storage.removeItems([courseKey(id), ...Array.from({ length: parts }, (_, n) => partKey(id, n)), seenKey(id)]);
  });
}
