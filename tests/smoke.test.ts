import { describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { storage } from "wxt/utils/storage";

describe("test setup", () => {
  it("has a DOM", () => {
    const div = document.createElement("div");
    div.textContent = "hi";
    expect(div.textContent).toBe("hi");
  });

  it("has a fake browser with working storage", async () => {
    await storage.setItem("sync:x", 1);
    expect(await storage.getItem("sync:x")).toBe(1);
    fakeBrowser.reset();
    expect(await storage.getItem("sync:x")).toBeNull();
  });
});
