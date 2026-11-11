import { computeProgress } from "../../src/model/progress";
import { renderPopup } from "../../src/popup/view";
import { getGlobal, getSeen, listCourses } from "../../src/storage/store";

const ORIGIN = "https://www.moodle.tum.de";
const root = document.getElementById("app") as HTMLElement;

async function main(): Promise<void> {
  const [global, courses] = await Promise.all([getGlobal(), listCourses()]);
  const rows = await Promise.all(courses.map(async ({ id, data }) => {
    const { course } = computeProgress(await getSeen(id), data, global);
    return { id, name: data.name || `Course ${id}`, done: course.done, total: course.total };
  }));
  renderPopup(root, rows, {
    openCourse: (id) => {
      browser.tabs.create({ url: `${ORIGIN}/course/view.php?id=${id}` });
      window.close();
    },
    openOptions: () => {
      browser.runtime.openOptionsPage();
      window.close();
    },
  });
}

main().catch((err: unknown) => console.error("[moodle-todo] popup failed", err));
