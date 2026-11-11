import type { CourseData, GlobalData, ItemState, Layer, Rule, RuleItem } from "../types";

const LAYERS: Layer[] = ["item", "course", "global"];

function ruleAt(layer: Layer, item: RuleItem, course: CourseData, global: GlobalData): Rule | undefined {
  switch (layer) {
    case "item":
      return course.itemOverrides[String(item.cmid)];
    case "course":
      return course.typeRules[item.type];
    case "global":
      return global.typeRules[item.type];
  }
}

/** Rule in effect from `layer` downward: that layer, then the less specific ones, then the default. */
function effectiveRule(layer: Layer, item: RuleItem, course: CourseData, global: GlobalData): Rule {
  for (const l of LAYERS.slice(LAYERS.indexOf(layer))) {
    const r = ruleAt(l, item, course, global);
    if (r) return r;
  }
  return "track";
}

export function resolveState(item: RuleItem, course: CourseData, global: GlobalData): ItemState {
  if (effectiveRule("item", item, course, global) === "ignore") return "ignored";
  return course.done.includes(item.cmid) ? "done" : "open";
}

/** The value currently in effect at a layer. The menu offers the opposite. */
export function menuState(layer: Layer, item: RuleItem, course: CourseData, global: GlobalData): Rule {
  return effectiveRule(layer, item, course, global);
}

/**
 * Sets the rule at `layer` to `value`. If the layers below already resolve to
 * `value`, the rule at `layer` is removed instead, so rules do not pile up.
 * Returns new objects; inputs are not mutated.
 */
export function applyMenuAction(
  layer: Layer,
  value: Rule,
  item: RuleItem,
  course: CourseData,
  global: GlobalData,
): { course: CourseData; global: GlobalData } {
  const below = LAYERS[LAYERS.indexOf(layer) + 1];
  const inherited = below ? effectiveRule(below, item, course, global) : "track";

  const nextCourse: CourseData = {
    ...course,
    itemOverrides: { ...course.itemOverrides },
    typeRules: { ...course.typeRules },
  };
  const nextGlobal: GlobalData = { typeRules: { ...global.typeRules } };

  const target =
    layer === "item" ? nextCourse.itemOverrides : layer === "course" ? nextCourse.typeRules : nextGlobal.typeRules;
  const key = layer === "item" ? String(item.cmid) : item.type;

  if (inherited === value) delete target[key];
  else target[key] = value;

  return { course: nextCourse, global: nextGlobal };
}

/** Sets the global rule for `type`. "track" is the default, so it removes the rule. Does not mutate `global`. */
export function setGlobalTypeRule(global: GlobalData, type: string, value: Rule): GlobalData {
  const typeRules = { ...global.typeRules };
  if (value === "track") delete typeRules[type];
  else typeRules[type] = value;
  return { ...global, typeRules };
}

export function toggleDone(course: CourseData, cmid: number, done: boolean): CourseData {
  const set = new Set(course.done);
  if (done) set.add(cmid);
  else set.delete(cmid);
  return { ...course, done: [...set].sort((a, b) => a - b) };
}
