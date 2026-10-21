import { describe, expect, it } from "vitest";
import {
  filterLines,
  jsonPath,
  percent,
  pushSample,
  sparklinePoints,
  touchesContainer,
} from "./details-utils.js";

describe("details utils", () => {
  it("scales a series into an SVG polyline", () => {
    expect(sparklinePoints([0, 5, 10], 100, 20)).toBe("0.0,20.0 50.0,10.0 100.0,0.0");
    expect(sparklinePoints([], 100, 20)).toBe("");
    expect(sparklinePoints([3], 100, 20)).toBe("0.0,0.0");
  });

  it("keeps a bounded window of samples", () => {
    let s: number[] = [];
    for (let i = 0; i < 50; i++) s = pushSample(s, i, 10);
    expect(s).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);
  });

  it("filters log lines case-insensitively", () => {
    expect(filterLines("a Error\nb ok\nc ERROR", "error")).toEqual(["a Error", "c ERROR"]);
    expect(filterLines("a\nb", "  ")).toEqual(["a", "b"]);
  });

  it("builds copyable JSON paths", () => {
    expect(jsonPath(["Config", "Env", 0])).toBe("Config.Env[0]");
    expect(jsonPath(["NetworkSettings", "Networks", "my-net", "IPAddress"])).toBe(
      'NetworkSettings.Networks["my-net"].IPAddress',
    );
  });

  it("computes bounded percentages", () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(500, 200)).toBe(100);
  });
});

describe("touchesContainer", () => {
  it("matches the container by exact name in the detail of an audit entry", () => {
    expect(touchesContainer("env container=api set=A unset=-", "api")).toBe(true);
    expect(touchesContainer("read env container=api", "api")).toBe(true);
    expect(touchesContainer("binding create consumer=web provider=api name=Api", "api")).toBe(true);
    expect(touchesContainer("env container=api2 set=A unset=-", "api")).toBe(false);
    expect(touchesContainer("env container=my-api set=A unset=-", "api")).toBe(false);
    expect(touchesContainer("zone apply zone=api done=1", "api")).toBe(false);
  });

  it("treats dots in names literally", () => {
    expect(touchesContainer("env container=a.b set=- unset=-", "a.b")).toBe(true);
    expect(touchesContainer("env container=axb set=- unset=-", "a.b")).toBe(false);
  });
});
