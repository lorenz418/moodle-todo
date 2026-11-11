import { KNOWN_TYPES } from "../../src/model/typeNames";
import { renderOptions } from "../../src/options/view";
import { getGlobal, listCourses, listSeenTypes, removeCourse, resetCourseRules, updateGlobal } from "../../src/storage/store";
import type { Rule } from "../../src/types";

const root = document.getElementById("app") as HTMLElement;

async function refresh(): Promise<void> {
  const [global, seenTypes, courses] = await Promise.all([getGlobal(), listSeenTypes(), listCourses()]);
  const extra = seenTypes.filter((t) => !KNOWN_TYPES.includes(t)).sort();
  renderOptions(root, { global, types: [...KNOWN_TYPES, ...extra], courses }, {
    setGlobalType: (type, value: Rule) => run(updateGlobal((g) => {
      const typeRules = { ...g.typeRules };
      if (value === "track") delete typeRules[type];
      else typeRules[type] = value;
      return { ...g, typeRules };
    })),
    resetCourseRules: (id) => run(resetCourseRules(id)),
    removeCourse: (id) => run(removeCourse(id)),
  });
}

function run(p: Promise<unknown>): void {
  p.then(refresh).catch((err: unknown) => {
    console.error("[moodle-todo] options action failed", err);
    alert("Could not save the change. See the console for details.");
  });
}

refresh();
