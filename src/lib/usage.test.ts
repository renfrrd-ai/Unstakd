import { describe, expect, it } from "vitest";
import { cpuOfAllocation, vcpu } from "./usage";

describe("cpuOfAllocation", () => {
  it("scales % of one core to the app's allocation", () => {
    expect(cpuOfAllocation(43, 0.5)).toBe(86);
    expect(cpuOfAllocation(50, 2)).toBe(25);
  });
  it("is null without a sample", () => {
    expect(cpuOfAllocation(null, 1)).toBeNull();
    expect(cpuOfAllocation(undefined, 1)).toBeNull();
  });
});

describe("vcpu", () => {
  it("formats allocations", () => {
    expect(vcpu(1)).toBe("1 vCPU");
    expect(vcpu(0.5)).toBe("0.5 vCPU");
    expect(vcpu(0.25)).toBe("0.25 vCPU");
    expect(vcpu(2)).toBe("2 vCPU");
  });
});
