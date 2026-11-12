import { defineConfig } from "wxt";

export default defineConfig({
  // `npm run build` writes the folder to load in Chrome to dist/moodle-todo
  // (`npm run dev` uses dist/moodle-todo-dev); `npm run zip` adds dist/moodle-todo-chrome.zip.
  outDir: "dist",
  outDirTemplate: "moodle-todo{{modeSuffix}}",
  zip: { artifactTemplate: "moodle-todo-chrome.zip" },
  manifest: {
    name: "Moodle Todo",
    description: "Check off lectures and problem sheets directly on TUM Moodle course pages.",
    permissions: ["storage"],
    action: { default_title: "Moodle Todo settings" },
  },
});
