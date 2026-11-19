import { describe, expect, it } from "vitest";
import { parseDotEnv, slugSchema, sizeOf } from "./validation";

describe("parseDotEnv", () => {
  it("parses common forms", () => {
    const { entries, invalid } = parseDotEnv(`# comment
A=1
export B = two
C="quoted # not comment"
D='single'
E=val # trailing comment
1BAD=x
nope
`);
    expect(entries).toEqual([["A", "1"], ["B", "two"], ["C", "quoted # not comment"], ["D", "single"], ["E", "val"]]);
    expect(invalid).toEqual([7, 8]);
  });
});

describe("slugs and sizes", () => {
  it("validates slugs", () => {
    expect(slugSchema.parse(" My-App ")).toBe("my-app");
    expect(slugSchema.safeParse("-bad").success).toBe(false);
    expect(slugSchema.safeParse("a_b").success).toBe(false);
  });
  it("maps limits to a size", () => {
    expect(sizeOf(0.5, 256)).toBe("small");
    expect(sizeOf(3, 3000)).toBe("medium");
  });
});
