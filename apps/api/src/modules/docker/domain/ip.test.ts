import { cidrContains, isCidr } from "@nautix/contracts";
import { describe, expect, it } from "vitest";

describe("isCidr", () => {
  it.each([
    ["10.0.0.0/24", true],
    ["192.168.1.5", true],
    ["0.0.0.0/0", true],
    ["fd00::/8", true],
    ["::1", true],
    ["10.0.0.0/33", false],
    ["fd00::/129", false],
    ["10.0.0.0/", false],
    ["10.0.0.0/24/1", false],
    ["nope/24", false],
    ["", false],
  ])("%s → %s", (value, ok) => {
    expect(isCidr(value)).toBe(ok);
  });
});

describe("cidrContains", () => {
  it("matches networks and single hosts", () => {
    expect(cidrContains("10.0.0.0/24", "10.0.0.77")).toBe(true);
    expect(cidrContains("10.0.0.0/24", "10.0.1.1")).toBe(false);
    expect(cidrContains("192.168.1.5", "192.168.1.5")).toBe(true);
    expect(cidrContains("192.168.1.5", "192.168.1.6")).toBe(false);
    expect(cidrContains("0.0.0.0/0", "8.8.8.8")).toBe(true);
  });

  it("handles IPv6, including :: and dotted tails", () => {
    expect(cidrContains("fd00::/8", "fd12:3456::1")).toBe(true);
    expect(cidrContains("fd00::/8", "fe80::1")).toBe(false);
    expect(cidrContains("::1", "0:0:0:0:0:0:0:1")).toBe(true);
    expect(cidrContains("::ffff:0:0/96", "::ffff:1.2.3.4")).toBe(true);
  });

  it("never matches across families or with bad input", () => {
    expect(cidrContains("10.0.0.0/8", "::1")).toBe(false);
    expect(cidrContains("::/0", "10.0.0.1")).toBe(false);
    expect(cidrContains("10.0.0.0/99", "10.0.0.1")).toBe(false);
    expect(cidrContains("10.0.0.0/8", "garbage")).toBe(false);
  });
});
