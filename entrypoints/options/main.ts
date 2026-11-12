import { setCourseTypeRule, setGlobalTypeRule } from "../../src/model/rules";
import { KNOWN_TYPES } from "../../src/model/typeNames";
import { renderOptions } from "../../src/options/view";
import {
  getGlobal, listCourses, listSeenTypes, removeCourse, resetCourseRules, updateCourse, updateGlobal,
} from "../../src/storage/store";
import type { Rule } from "../../src/types";

const root = document.getElementById("app") as HTMLElement;

async function refresh(): Promise<void> {
  const [global, seenTypes, courses] = await Promise.all([getGlobal(), listSeenTypes(), listCourses()]);
  const extra = seenTypes.filter((t) => !KNOWN_TYPES.includes(t)).sort();
  renderOptions(root, { global, types: [...KNOWN_TYPES, ...extra], courses, version: browser.runtime.getManifest().version }, {
    setGlobalType: (type, value: Rule) => run(updateGlobal((g) => setGlobalTypeRule(g, type, value))),
    setCourseType: (id, type, value) => run(updateCourse(id, (c) => setCourseTypeRule(c, type, value))),
    resetCourseRules: (id) => run(resetCourseRules(id)),
    removeCourse: (id) => run(removeCourse(id)),
    manageExtension: () => {
      browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` });
    },
    uninstall: () => {
      browser.management.uninstallSelf({ showConfirmDialog: true }).catch(() => { /* cancelled */ });
    },
  });
}

function run(p: Promise<unknown>): void {
  p.then(refresh).catch((err: unknown) => {
    console.error("[moodle-todo] options action failed", err);
    alert("Could not save the change. See the console for details.");
    // Re-render so the controls match what is actually stored.
    refresh().catch((e: unknown) => console.error("[moodle-todo] options refresh failed", e));
  });
}

refresh();
