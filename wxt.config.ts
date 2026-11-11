import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Moodle Todo",
    description: "Check off lectures and problem sheets directly on TUM Moodle course pages.",
    permissions: ["storage"],
  },
});
