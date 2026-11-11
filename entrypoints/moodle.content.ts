import { defineContentScript } from "wxt/utils/define-content-script";
import { App } from "../src/app";
import { parsePage } from "../src/parse/page";
import "../src/ui/styles.css";

export default defineContentScript({
  matches: [
    "https://www.moodle.tum.de/course/view.php*",
    "https://www.moodle.tum.de/course/section.php*",
  ],
  runAt: "document_idle",
  async main(ctx) {
    const page = parsePage(document);
    if (!page) {
      console.warn("[moodle-todo] not a recognizable course page, doing nothing");
      return;
    }
    const app = new App(document, page, {
      isCoursePage: location.pathname.endsWith("/course/view.php"),
      origin: location.origin,
      signal: ctx.signal,
    });
    ctx.onInvalidated(() => app.invalidate());
    try {
      await app.start();
    } catch (e) {
      console.error("[moodle-todo] failed to start", e);
    }
  },
});
