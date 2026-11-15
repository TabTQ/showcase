import { describe, expect, it } from "vitest";
import { fmtBytes } from "./util";

describe("fmtBytes", () => {
  it("formats sizes", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(5155676160)).toBe("4.8 GB");
    expect(fmtBytes(NaN)).toBe("-");
  });
});
