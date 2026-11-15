import { describe, expect, it } from "vitest";
import { parseRoute } from "./App";
import { introToText, textToIntro } from "./WebappPage";

describe("editor helpers", () => {
  it("parses routes", () => {
    expect(parseRoute("#/other")).toEqual({ name: "home" });
    expect(parseRoute("#/p/12")).toEqual({ name: "page", id: 12 });
    expect(parseRoute("#/p/12/edit")).toEqual({ name: "edit", id: 12 });
    expect(parseRoute("#/p/12/history")).toEqual({ name: "history", id: 12 });
    expect(parseRoute("#/p/12/publish")).toEqual({ name: "publish", id: 12 });
    expect(parseRoute("#/trash")).toEqual({ name: "trash" });
    expect(parseRoute("#/p/x")).toEqual({ name: "home" });
    expect(parseRoute("")).toEqual({ name: "home" });
  });

  it("turns the intro text into paragraphs and back", () => {
    const doc = textToIntro("Click a box.\n\nThen another.");
    expect(doc?.content).toHaveLength(3);
    expect(introToText(doc)).toBe("Click a box.\n\nThen another.");
    expect(textToIntro("  \n ")).toBeNull();
  });
});
