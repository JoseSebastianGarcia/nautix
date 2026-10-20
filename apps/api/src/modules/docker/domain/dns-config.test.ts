import { DnsRecord, dnsKind, isDnsImage, SaveDnsRecords } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { buildDnsmasqConfig } from "./dns-config.js";

const rec = (name: string, ip: string) => DnsRecord.parse({ name, ip });

describe("dnsmasq config", () => {
  it("writes one address= line per record, sorted, with a banner", () => {
    const text = buildDnsmasqConfig([
      rec("b.lab", "10.0.0.2"),
      rec("A.lab", "10.0.0.1"),
      rec("v6.lab", "fd00::1"),
    ]);
    expect(text.split("\n")).toEqual([
      expect.stringContaining("Managed by Nautix"),
      "address=/a.lab/10.0.0.1",
      "address=/b.lab/10.0.0.2",
      "address=/v6.lab/fd00::1",
      "",
    ]);
  });

  it("cannot be tricked into writing other directives", () => {
    expect(() =>
      buildDnsmasqConfig([{ name: "x/1.1.1.1\nserver=8.8.8.8", ip: "10.0.0.1" }]),
    ).toThrow();
    expect(() =>
      buildDnsmasqConfig([{ name: "ok.lab", ip: "10.0.0.1\nserver=8.8.8.8" }]),
    ).toThrow();
    expect(() => buildDnsmasqConfig([{ name: "ok.lab", ip: "999.1.1.1" }])).toThrow();
  });
});

describe("DNS contracts", () => {
  it("normalises names and rejects bad ones", () => {
    expect(rec(" Web.Home.Lab ", " 192.168.1.5 ")).toEqual({
      name: "web.home.lab",
      ip: "192.168.1.5",
    });
    for (const bad of [
      "",
      "-a.lab",
      "a..lab",
      "a b.lab",
      "a_b.lab",
      "http://x.lab",
      "x".repeat(64) + ".lab",
    ])
      expect(() => rec(bad, "10.0.0.1")).toThrow();
    for (const ip of [
      "",
      "256.0.0.1",
      "1.2.3",
      "hello",
      "10.0.0.1/24",
      "fd00:::1",
      "1:2:3:4:5:6:7:8:9",
      "12345::1",
      "g::1",
      "1::2::3",
      "::1::",
      "fd00::1\nserver=8.8.8.8",
    ])
      expect(() => rec("a.lab", ip)).toThrow();
  });

  it("accepts the usual IPv6 forms", () => {
    for (const ip of [
      "::1",
      "::",
      "fd00::1",
      "2001:db8::ff00:42:8329",
      "1:2:3:4:5:6:7:8",
      "::ffff:192.168.1.1",
      "fe80::1",
    ])
      expect(rec("a.lab", ip).ip).toBe(ip);
  });

  it("allows one IPv4 and one IPv6 per name, not two of the same family", () => {
    expect(
      SaveDnsRecords.safeParse({ records: [rec("a.lab", "10.0.0.1"), rec("a.lab", "fd00::1")] })
        .success,
    ).toBe(true);
    expect(
      SaveDnsRecords.safeParse({ records: [rec("a.lab", "10.0.0.1"), rec("a.lab", "10.0.0.2")] })
        .success,
    ).toBe(false);
  });

  it("only dockurr/dnsmasq is editable; other DNS images are recognised", () => {
    expect(dnsKind("dockurr/dnsmasq:2.93")).toBe("dnsmasq");
    expect(dnsKind("jpillora/dnsmasq:1.1")).toBeNull();
    expect(dnsKind("adguard/adguardhome")).toBeNull();
    expect(isDnsImage("adguard/adguardhome")).toBe(true);
    expect(isDnsImage("pihole/pihole:latest")).toBe(true);
    expect(isDnsImage("nginx")).toBe(false);
  });
});
