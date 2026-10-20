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

  it("applies saved zone positions and moves the containers with them", () => {
    const base = layoutTopology([ctr("a", ["edge"])], networks);
    const moved = layoutTopology([ctr("a", ["edge"])], networks, {
      zones: { edge: { x: 900, y: 700 } },
      nodes: {},
    });
    const zone = moved.zones.find((z) => z.id === "e");
    expect(zone).toMatchObject({ x: 900, y: 700 });
    const before = base.placements[0];
    const after = moved.placements[0];
    const baseZone = base.zones.find((z) => z.id === "e");
    expect(after?.x ? after.x - 900 : undefined).toBe(
      before && baseZone ? before.x - baseZone.x : null,
    );
  });

  it("applies saved container offsets and grows the box around them", () => {
    const t = layoutTopology([ctr("a", ["edge"])], networks, {
      zones: {},
      nodes: { a: { x: 500, y: 300 } },
    });
    const zone = t.zones.find((z) => z.id === "e");
    const p = t.placements[0];
    expect(zone && p && p.x === zone.x + 500 && p.y === zone.y + 300).toBe(true);
    expect(zone && zone.w >= 500 + 220).toBe(true);
    expect(zone && zone.h >= 300 + 72).toBe(true);
  });

  it("keeps saved offsets from escaping above or left of the box", () => {
    const t = layoutTopology([ctr("a", ["edge"])], networks, {
      zones: {},
      nodes: { a: { x: -50, y: -50 } },
    });
    const zone = t.zones.find((z) => z.id === "e");
    const p = t.placements[0];
    expect(zone && p && p.x >= zone.x && p.y >= zone.y + 52).toBe(true);
  });
});
