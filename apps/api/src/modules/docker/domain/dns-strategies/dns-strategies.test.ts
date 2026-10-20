import { DnsRecord, dnsKind } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { buildCorefile } from "./coredns.strategy.js";
import { buildDnsmasqConfig } from "./dnsmasq.strategy.js";
import { dnsStrategyFor, supportedDnsKinds } from "./index.js";

const rec = (name: string, ip: string) => DnsRecord.parse({ name, ip });

describe("dnsmasq adapter", () => {
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

  it("plans a validated swap and a restart", () => {
    const plan = dnsStrategyFor("dnsmasq").plan([rec("a.lab", "10.0.0.1")]);
    expect(plan.files[0]?.path).toBe("/etc/dnsmasq.d/nautix.conf.new");
    expect(plan.commands[0]?.join(" ")).toContain("dnsmasq --test");
    expect(plan.apply).toEqual({ type: "restart" });
  });
});

describe("CoreDNS adapter", () => {
  it("answers a name and its subdomains, with the most specific name first", () => {
    const text = buildCorefile([rec("app.lab", "10.0.0.1"), rec("db.app.lab", "10.0.0.2")]);
    const first = text.indexOf("db[.]app[.]lab");
    const second = text.indexOf("(^|[.])app[.]lab");
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(second);
    expect(text).toContain('match "(^|[.])app[.]lab[.]$"');
    expect(text).toContain('answer "{{ .Name }} 60 IN A 10.0.0.1"');
    expect(text).toContain("forward . /etc/resolv.conf");
    expect(text).toContain("reload 2s 1s");
  });

  it("answers the missing family with an empty NOERROR instead of asking upstream", () => {
    const text = buildCorefile([
      rec("v4only.lab", "10.0.0.1"),
      rec("both.lab", "10.0.0.2"),
      rec("both.lab", "fd00::2"),
    ]);
    expect(text).toMatch(
      /template IN AAAA \{\n\s+match "\(\^\|\[\.\]\)v4only\[\.\]lab\[\.\]\$"\n\s+rcode NOERROR/,
    );
    expect(text).not.toMatch(/both[^\n]*\n\s+rcode NOERROR/);
  });

  it("never writes a backslash or a quote from a record into the file", () => {
    const text = buildCorefile([rec("a-b.lab", "10.0.0.1")]);
    expect(text).not.toContain("\\");
    expect(() => dnsStrategyFor("coredns").plan([{ name: 'x" { evil', ip: "10.0.0.1" }])).toThrow();
  });

  it("writes into a stopped container and waits for the reload", () => {
    const s = dnsStrategyFor("coredns");
    expect(s.writesWhileStopped).toBe(true);
    const plan = s.plan([rec("a.lab", "10.0.0.1")]);
    expect(plan.files[0]?.path).toBe("/etc/coredns/Corefile");
    expect(plan.commands).toEqual([]);
    expect(plan.apply.type).toBe("reload");
  });
});

describe("DNS registry", () => {
  it("has exactly one adapter per supported kind, each reporting its own kind", () => {
    expect(supportedDnsKinds()).toEqual(["dnsmasq", "coredns"]);
    for (const k of supportedDnsKinds()) expect(dnsStrategyFor(k).kind).toBe(k);
  });

  it("detects the servers from the image name", () => {
    expect(dnsKind("dockurr/dnsmasq:2.93")).toBe("dnsmasq");
    expect(dnsKind("coredns/coredns:1.14.7")).toBe("coredns");
    expect(dnsKind("docker.io/coredns/coredns")).toBe("coredns");
    expect(dnsKind("jpillora/dnsmasq")).toBeNull();
  });
});
