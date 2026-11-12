import { existsSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// These tests run against Moodle pages saved in examples/, which is not in git
// because the pages contain personal data. Without the folder they are skipped.
const FIXTURE_TESTS = ["tests/app.test.ts", "tests/parse/page.test.ts", "tests/ui/render.test.ts"];
const hasExamples = existsSync(new URL("./examples", import.meta.url));
if (!hasExamples) console.warn(`examples/ not found, skipping ${FIXTURE_TESTS.join(", ")}`);

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: hasExamples ? configDefaults.exclude : [...configDefaults.exclude, ...FIXTURE_TESTS],
  },
});
