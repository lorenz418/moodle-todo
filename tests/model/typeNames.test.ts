import { describe, expect, it } from "vitest";
import { KNOWN_TYPES, typeName, typeNamePlural } from "../../src/model/typeNames";

describe("typeName", () => {
  it("maps known module types to display names", () => {
    expect(typeName("resource")).toBe("File");
    expect(typeName("lti")).toBe("Recording");
    expect(typeName("choice")).toBe("Survey");
  });

  it("falls back to the raw type", () => {
    expect(typeName("h5pactivity")).toBe("h5pactivity");
  });

  it("has plural display names with a fallback", () => {
    expect(typeNamePlural("resource")).toBe("Files");
    expect(typeNamePlural("quiz")).toBe("Quizzes");
    expect(typeNamePlural("h5pactivity")).toBe("h5pactivity items");
  });

  it("lists the known types", () => {
    expect(KNOWN_TYPES).toEqual([
      "resource", "lti", "url", "folder", "assign", "forum", "choice", "quiz", "page",
    ]);
  });
});
