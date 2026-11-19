import { describe, expect, it } from "vitest";
import { parseState, safeNext } from "./oauth";

describe("safeNext", () => {
  it.each([
    ["/projects/x", "/projects/x"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    [null, "/"],
  ])("%s -> %s", (input, out) => expect(safeNext(input)).toBe(out));
});

describe("parseState", () => {
  it("parses valid state", () => expect(parseState('{"state":"a","next":"/"}')).toEqual({ state: "a", next: "/" }));
  it("rejects malformed input", () => {
    expect(parseState("{not json")).toBeNull();
    expect(parseState(undefined)).toBeNull();
    expect(parseState('{"state":1}')).toBeNull();
  });
});
