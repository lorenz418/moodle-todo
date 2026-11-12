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
    // Public key that pins the extension ID. Without it Chrome derives the ID from the folder
    // path, and moving or re-downloading the folder would start with empty storage.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuvZAxSIYsxJr9lb/4yqgHD0VDRlRgkahK66VifpDVwTC7KHGPhqQB3SwXZwNRN3nbUdWSRdVnBJ7bwm5xApBvJmOINt14y7/sx3LNNgYHS5yoj0XRG8pNlCkqsrBt3zTwniItutbV1kFNk3xhm3bcoIOZfp6lZfQHEg4c26h0mIg6OFNQIjlDTCjYAlB0MLAHovEdaliNz1cg93Y/EmXHuj66J61zKrZYKrzFCQT849bMkOb72L/J1Od2c2r3ViAyGZoOyyczP+cGerKNIkHBxhE28Pw1FIKTqeCd9pjgNucSkD3dLCJ/X9VK9mzrNXOmhSvYli+1mGj6MzqJMR/rwIDAQAB",
    action: { default_title: "Moodle Todo settings" },
  },
});
