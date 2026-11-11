import { storage, type StorageItemKey } from "wxt/utils/storage";
import { DEFAULT_GLOBAL, emptyCourse, type CourseData, type GlobalData, type SeenCache } from "../types";

const GLOBAL_KEY = "sync:global" as const;
const COURSE_PREFIX = "course:";
const SEEN_PREFIX = "seen:";

const courseKey = (id: number): StorageItemKey => `sync:${COURSE_PREFIX}${id}`;
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

export async function getGlobal(): Promise<GlobalData> {
  return (await storage.getItem<GlobalData>(GLOBAL_KEY)) ?? DEFAULT_GLOBAL;
}

export function updateGlobal(fn: (g: GlobalData) => GlobalData): Promise<GlobalData> {
  return serialized(async () => {
    const next = fn(await getGlobal());
    await storage.setItem(GLOBAL_KEY, next);
    return next;
  });
}

export async function getCourse(id: number): Promise<CourseData> {
  return (await storage.getItem<CourseData>(courseKey(id))) ?? emptyCourse();
}

export function updateCourse(id: number, fn: (c: CourseData) => CourseData): Promise<CourseData> {
  return serialized(async () => {
    const next = fn(await getCourse(id));
    await storage.setItem(courseKey(id), next);
    return next;
  });
}

/** Like updateCourse, but hands `fn` the global data as it is at write time. */
export function updateCourseWithGlobal(
  id: number,
  fn: (c: CourseData, g: GlobalData) => CourseData,
): Promise<CourseData> {
  return serialized(async () => {
    const next = fn(await getCourse(id), await getGlobal());
    await storage.setItem(courseKey(id), next);
    return next;
  });
}

export async function getSeen(id: number): Promise<SeenCache> {
  return (await storage.getItem<SeenCache>(seenKey(id))) ?? {};
}

export function setSeen(id: number, seen: SeenCache): Promise<void> {
  return serialized(() => storage.setItem(seenKey(id), seen));
}

/** Fallback mode: replace the cached entries of `sectionNums` with `items`, keep other sections. */
export function mergeSeenSections(id: number, sectionNums: number[], items: SeenInput[]): Promise<SeenCache> {
  return serialized(async () => {
    const current = await getSeen(id);
    const replaced = new Set(sectionNums);
    const next: SeenCache = {};
    for (const [key, info] of Object.entries(current)) {
      if (!replaced.has(info.section)) next[key] = info;
    }
    for (const item of items) next[String(item.cmid)] = { section: item.section, type: item.type };
    await storage.setItem(seenKey(id), next);
    return next;
  });
}

export function watchGlobal(cb: (g: GlobalData) => void): () => void {
  return storage.watch<GlobalData>(GLOBAL_KEY, (value) => cb(value ?? DEFAULT_GLOBAL));
}

export function watchCourse(id: number, cb: (c: CourseData) => void): () => void {
  return storage.watch<CourseData>(courseKey(id), (value) => cb(value ?? emptyCourse()));
}

export async function listCourses(): Promise<Array<{ id: number; data: CourseData }>> {
  const all = await storage.snapshot("sync");
  const result: Array<{ id: number; data: CourseData }> = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(COURSE_PREFIX)) continue;
    const id = Number(key.slice(COURSE_PREFIX.length));
    if (Number.isFinite(id) && value) result.push({ id, data: value as CourseData });
  }
  return result;
}

/** Every module type that appears in any seen cache or any stored rule. */
export async function listSeenTypes(): Promise<string[]> {
  const types = new Set<string>();
  const local = await storage.snapshot("local");
  for (const [key, value] of Object.entries(local)) {
    if (!key.startsWith(SEEN_PREFIX) || !value) continue;
    for (const info of Object.values(value as SeenCache)) types.add(info.type);
  }
  for (const t of Object.keys((await getGlobal()).typeRules)) types.add(t);
  for (const { data } of await listCourses()) for (const t of Object.keys(data.typeRules)) types.add(t);
  return [...types];
}

export async function resetCourseRules(id: number): Promise<void> {
  await updateCourse(id, (c) => ({ ...c, itemOverrides: {}, typeRules: {} }));
}

export async function removeCourse(id: number): Promise<void> {
  await serialized(async () => {
    await storage.removeItem(courseKey(id));
    await storage.removeItem(seenKey(id));
  });
}
