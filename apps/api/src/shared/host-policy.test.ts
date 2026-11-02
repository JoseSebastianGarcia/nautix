import { describe, expect, it } from "vitest";
import { HostPolicy, hostnameOf } from "./host-policy.js";

describe("hostnameOf", () => {
  it("drops the port and the brackets of an IPv6 address", () => {
    expect(hostnameOf("Localhost:3737")).toBe("localhost");
    expect(hostnameOf("[::1]:3737")).toBe("::1");
    expect(hostnameOf("nautix.lan")).toBe("nautix.lan");
  });

  it("is null when there is no usable header", () => {
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf("")).toBeNull();
    expect(hostnameOf("[::1")).toBeNull();
  });
});

describe("HostPolicy (ADR-063)", () => {
  const policy = new HostPolicy(() => ["nautix.lan"]);

  it("answers to the machine itself and to IP addresses", () => {
    for (const host of [
      "localhost:3737",
      "127.0.0.1:3737",
      "[::1]:3737",
      "192.168.1.10",
      "a.localhost",
    ])
      expect(policy.allows(host)).toBe(true);
  });

  it("answers to the names that were listed, whatever their case", () => {
    expect(policy.allows("nautix.lan:3737")).toBe(true);
    expect(policy.allows("NAUTIX.LAN")).toBe(true);
  });

  it("refuses any other name: that is what a rebinding page sends", () => {
    expect(policy.allows("evil.example:3737")).toBe(false);
    expect(policy.allows("localhost.evil.example")).toBe(false);
    expect(policy.allows(undefined)).toBe(false);
  });

  it("lets everything in when the list holds *", () => {
    expect(new HostPolicy(() => ["*"]).allows("evil.example")).toBe(true);
  });
});
