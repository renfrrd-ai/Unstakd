import { describe, expect, it } from "vitest";
import { bytes, clock, duration, timeAgo } from "./format";
import { projectHealth } from "./status";

const now = Date.UTC(2026, 10, 18, 12);
const minus = (min: number) => new Date(now - min * 60_000);

describe("format", () => {
  it("timeAgo", () => {
    expect(timeAgo(minus(0.2), now)).toBe("now");
    expect(timeAgo(minus(12), now)).toBe("12m ago");
    expect(timeAgo(minus(120), now)).toBe("2h ago");
    expect(timeAgo(minus(60 * 30), now)).toBe("yesterday");
    expect(timeAgo(minus(60 * 24 * 3), now)).toBe("3d ago");
    expect(timeAgo(null, now)).toBe("never");
  });

  it("duration and clock", () => {
    expect(duration(700)).toBe("0.7s");
    expect(duration(34_000)).toBe("34s");
    expect(duration(72_000)).toBe("1m 12s");
    expect(clock(72_500)).toBe("01:12");
  });

  it("bytes", () => {
    expect(bytes(180 * 1024 * 1024)).toBe("180 MB");
    expect(bytes(4_200_000)).toBe("4.0 MB");
  });
});

describe("projectHealth", () => {
  const active = { state: "active" as const, liveDeploymentId: "x" };
  it("prioritises standby, then in-progress, then failure", () => {
    expect(projectHealth({ ...active, state: "standby" }, { id: "1", status: "failed" })).toBe("standby");
    expect(projectHealth(active, { id: "1", status: "building" })).toBe("building");
    expect(projectHealth(active, { id: "1", status: "failed" })).toBe("attention");
    expect(projectHealth(active, { id: "x", status: "live" })).toBe("live");
    expect(projectHealth({ ...active, liveDeploymentId: null }, undefined)).toBe("new");
  });
});
