import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
  matches: [
    "https://www.moodle.tum.de/course/view.php*",
    "https://www.moodle.tum.de/course/section.php*",
  ],
  runAt: "document_idle",
  main() {
    console.log("[moodle-todo] loaded");
  },
});
