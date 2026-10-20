import type { Container, Network } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { EXTERNAL_ID, layoutTopology, zoneAt } from "./layout.js";

const net = (id: string, name: string, system = false): Network => ({
  id,
  name,
  driver: "bridge",
  internal: false,
  subnet: null,
  containerIds: [],
  system,
});

const ctr = (id: string, networks: string[]): Container => ({
  id,
  name: id,
  image: "x",
  state: "running",
  status: "Up",
  createdAt: 0,
  ports: [],
  networks,
  labels: {},
});

describe("layoutTopology", () => {
  const networks = [net("b", "bridge", true), net("e", "edge"), net("k", "backend")];

  it("puts containers in their first user network and links the rest", () => {
    const t = layoutTopology([ctr("proxy", ["edge", "backend"]), ctr("db", ["backend"])], networks);
    expect(t.placements.find((p) => p.containerId === "proxy")?.zoneId).toBe("e");
    expect(t.placements.find((p) => p.containerId === "db")?.zoneId).toBe("k");
    expect(t.links).toEqual([{ containerId: "proxy", zoneId: "k" }]);
  });

  it("treats containers on only system networks as external", () => {
    const t = layoutTopology([ctr("lone", ["bridge"])], networks);
    expect(t.placements[0]?.zoneId).toBe(EXTERNAL_ID);
  });

  it("always renders the external frame plus one zone per user network", () => {
    const t = layoutTopology([], networks);
    expect(t.zones.map((z) => z.id)).toEqual([EXTERNAL_ID, "e", "k"]);
  });

  it("keeps nodes inside their zone and zones disjoint", () => {
    const t = layoutTopology(
      [ctr("a", ["edge"]), ctr("b", ["edge"]), ctr("c", ["edge"])],
      networks,
    );
    for (const p of t.placements) {
      const z = t.zones.find((zone) => zone.id === p.zoneId);
      expect(z && p.x >= z.x && p.x + 220 <= z.x + z.w && p.y + 72 <= z.y + z.h).toBe(true);
    }
    for (const a of t.zones) {
      for (const b of t.zones) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it("finds the zone under a point", () => {
    const t = layoutTopology([ctr("a", ["edge"])], networks);
    const p = t.placements[0];
    expect(p && zoneAt(t.zones, p.x + 10, p.y + 10)?.id).toBe("e");
    expect(zoneAt(t.zones, -999, -999)).toBeUndefined();
  });
});
