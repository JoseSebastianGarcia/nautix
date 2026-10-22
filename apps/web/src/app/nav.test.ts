import { describe, expect, it } from "vitest";
import { isActivePath, isResourcePath, isSwarmPath } from "./nav.js";

describe("navigation", () => {
  it("the Resources entry covers containers, images, volumes, networks and builds (and details)", () => {
    for (const p of [
      "/containers",
      "/containers/abc123",
      "/images",
      "/volumes",
      "/networks",
      "/builds",
      "/gateway",
      "/dns",
      "/guard",
    ]) {
      expect(isActivePath("/containers", p)).toBe(true);
      expect(isResourcePath(p)).toBe(true);
    }
    expect(isActivePath("/containers", "/compose")).toBe(false);
    expect(isResourcePath("/system")).toBe(false);
  });

  it("topology only matches the root; others match their subtree", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/compose")).toBe(false);
    expect(isActivePath("/compose", "/compose/stack1")).toBe(true);
    expect(isActivePath("/system", "/gateway")).toBe(false);
  });

  it("does not confuse similar prefixes", () => {
    expect(isActivePath("/containers", "/containers-old")).toBe(false);
  });

  it("swarm has its own entry and does not light up Resources", () => {
    expect(isSwarmPath("/swarm")).toBe(true);
    expect(isActivePath("/swarm", "/swarm")).toBe(true);
    expect(isActivePath("/containers", "/swarm")).toBe(false);
    expect(isResourcePath("/swarm")).toBe(false);
  });
});
