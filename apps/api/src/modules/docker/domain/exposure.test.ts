import { bindAddressOf, ChangeExposure, exposureInventory, exposureOf } from "@nautix/contracts";
import { describe, expect, it } from "vitest";

describe("exposureOf", () => {
  it.each([
    ["127.0.0.1", { kind: "local" }],
    ["::1", { kind: "local" }],
    ["0.0.0.0", { kind: "open" }],
    ["::", { kind: "open" }],
    ["", { kind: "open" }],
    [undefined, { kind: "open" }],
    ["192.168.1.20", { kind: "address", address: "192.168.1.20" }],
    ["fd00::5", { kind: "address", address: "fd00::5" }],
  ])("%s", (ip, expected) => {
    expect(exposureOf(ip)).toEqual(expected);
  });

  it("round-trips through the bind address", () => {
    for (const ip of ["127.0.0.1", "0.0.0.0", "10.0.0.2"])
      expect(bindAddressOf(exposureOf(ip))).toBe(ip);
  });
});

describe("ChangeExposure", () => {
  it("accepts the three kinds and refuses a bad address", () => {
    const ok = ChangeExposure.safeParse({
      ports: [
        { containerPort: 80, exposure: { kind: "local" } },
        { containerPort: 81, protocol: "udp", exposure: { kind: "open" } },
        { containerPort: 82, exposure: { kind: "address", address: "10.0.0.2" } },
      ],
    });
    expect(ok.success).toBe(true);
    expect(
      ChangeExposure.safeParse({
        ports: [{ containerPort: 80, exposure: { kind: "address", address: "not-an-ip" } }],
      }).success,
    ).toBe(false);
    expect(ChangeExposure.safeParse({ ports: [] }).success).toBe(false);
  });
});

describe("exposureInventory", () => {
  it("lists published ports with open ones first and skips unpublished ones", () => {
    const rows = exposureInventory([
      {
        id: "a",
        name: "db",
        state: "running",
        ports: [{ ip: "127.0.0.1", privatePort: 5432, publicPort: 5432, type: "tcp" }],
      },
      {
        id: "b",
        name: "web",
        state: "running",
        ports: [
          { ip: "0.0.0.0", privatePort: 80, publicPort: 8080, type: "tcp" },
          { privatePort: 9000, type: "tcp" },
        ],
      },
    ]);
    expect(rows.map((r) => [r.container, r.hostPort, r.exposure.kind])).toEqual([
      ["web", 8080, "open"],
      ["db", 5432, "local"],
    ]);
  });
});
