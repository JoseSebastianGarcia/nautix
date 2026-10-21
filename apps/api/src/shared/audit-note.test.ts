import type { GuardRule, ZoneActionResult } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import {
  bindingDetail,
  envDetail,
  exposureDetail,
  guardRulesDetail,
  zoneDetail,
} from "./audit-note.js";

describe("audit details", () => {
  it("lists variable names and never takes a value", () => {
    expect(envDetail("api", ["B", "A"], [])).toBe("env container=api set=B,A unset=-");
    expect(envDetail("api", [], ["OLD"])).toBe("env container=api set=- unset=OLD");
  });

  it("describes exposure per port", () => {
    expect(
      exposureDetail("web", [
        { containerPort: 80, protocol: "tcp", exposure: { kind: "open" } },
        { containerPort: 53, protocol: "udp", exposure: { kind: "address", address: "10.0.0.5" } },
      ]),
    ).toBe("exposure container=web 80/tcp=open 53/udp=10.0.0.5");
  });

  it("describes a binding without its variables", () => {
    expect(
      bindingDetail("create", { consumer: "api", provider: "db", name: "Orders", style: "dotnet" }),
    ).toBe("binding create consumer=api provider=db name=Orders style=dotnet");
    expect(bindingDetail("delete", { consumer: "api", provider: "db", name: "Orders" })).toBe(
      "binding delete consumer=api provider=db name=Orders",
    );
  });

  it("summarises a zone run and where it stopped", () => {
    const results: ZoneActionResult[] = [
      { action: { kind: "create-service", service: "db" }, status: "done" },
      {
        action: { kind: "update-service", service: "api", fields: ["env", "image"] },
        status: "failed",
        detail: "rolled back",
      },
      {
        action: {
          kind: "add-binding",
          consumer: "api",
          provider: "db",
          name: "Orders",
          style: "url",
        },
        status: "skipped",
      },
    ];
    const text = zoneDetail("shop", false, results);
    expect(text).toContain("zone apply zone=shop done=1 failed=1 skipped=1 removals=no");
    expect(text).toContain("failed-at=update-service:api(env+image)");
    expect(text).not.toContain("rolled back");
  });

  it("describes guard rules and clips long lists", () => {
    const rule = (i: number): GuardRule => ({
      container: `c${i}`,
      port: 80,
      protocol: "tcp",
      allow: ["10.0.0.0/24"],
    });
    expect(guardRulesDetail([rule(1)])).toBe("guard rules count=1 c1:80/tcp<-10.0.0.0/24");
    const long = guardRulesDetail(Array.from({ length: 80 }, (_, i) => rule(i)));
    expect(long.length).toBeLessThanOrEqual(480);
    expect(long.endsWith("…")).toBe(true);
  });
});
