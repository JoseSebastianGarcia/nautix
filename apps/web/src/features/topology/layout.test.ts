import type { Container, Network } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { EXTERNAL_ID, layoutTopology, NODE_H, NODE_W, pinAutoPositions, zoneAt } from "./layout.js";

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
    // Sorted by name (backend, edge), not in the order the engine happened to list them.
    expect(t.zones.map((z) => z.id)).toEqual([EXTERNAL_ID, "k", "e"]);
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

describe("layoutTopology with other placeable things", () => {
  it("lays out swarm services in their overlays, linking the extra ones", () => {
    const overlays = [net("o1", "shop"), net("o2", "public")];
    const t = layoutTopology(
      [
        { id: "s1", name: "svc:api", networks: ["shop", "public"] },
        { id: "s2", name: "svc:db", networks: ["shop"] },
        { id: "s3", name: "svc:loose", networks: [] },
      ],
      overlays,
    );
    expect(t.placements.map((p) => [p.containerId, p.zoneId])).toEqual([
      ["s3", "external"],
      ["s1", "o1"],
      ["s2", "o1"],
    ]);
    expect(t.links).toEqual([{ containerId: "s1", zoneId: "o2" }]);
  });
});

describe("a stable canvas (ADR-061)", () => {
  const nets = [net("e", "edge"), net("k", "backend"), net("s", "storage"), net("m", "monitoring")];
  const ctrs = [
    ctr("a", ["edge"]),
    ctr("b", ["backend"]),
    ctr("c", ["storage"]),
    ctr("d", ["edge"]),
  ];
  const spots = (t: ReturnType<typeof layoutTopology>) =>
    Object.fromEntries([
      ...t.zones.map((z) => [`zone:${z.network?.name ?? EXTERNAL_ID}`, [z.x, z.y]]),
      ...t.placements.map((p) => [`node:${p.name}`, [p.x, p.y]]),
    ]);

  it("lays out the same whatever order the engine lists networks and containers in", () => {
    const first = layoutTopology(ctrs, nets);
    const shuffled = layoutTopology([...ctrs].reverse(), [
      nets[2],
      nets[0],
      nets[3],
      nets[1],
    ] as Network[]);
    expect(spots(shuffled)).toEqual(spots(first));
  });

  it("pins the automatic spots of zones and containers that were never saved", () => {
    const topology = layoutTopology(ctrs, nets);
    const pinned = pinAutoPositions(topology, { zones: {}, nodes: {} });
    expect(Object.keys(pinned?.zones ?? {}).sort()).toEqual(
      ["backend", "edge", "external", "monitoring", "storage"].sort(),
    );
    expect(Object.keys(pinned?.nodes ?? {}).sort()).toEqual(["a", "b", "c", "d"]);
    // Offsets are relative to the box, like the ones a drag saves.
    const zone = topology.zones.find((z) => z.network?.name === "edge");
    const a = topology.placements.find((p) => p.name === "a");
    expect(pinned?.nodes.a).toEqual({
      x: (a?.x ?? 0) - (zone?.x ?? 0),
      y: (a?.y ?? 0) - (zone?.y ?? 0),
    });
  });

  it("leaves what the person already placed untouched", () => {
    const saved = { zones: { edge: { x: 1000, y: 900 } }, nodes: { a: { x: 60, y: 90 } } };
    const pinned = pinAutoPositions(layoutTopology(ctrs, nets, saved), saved);
    expect(pinned?.zones.edge).toEqual({ x: 1000, y: 900 });
    expect(pinned?.nodes.a).toEqual({ x: 60, y: 90 });
  });

  it("returns null when everything is pinned already, so nothing is saved again", () => {
    const pinned = pinAutoPositions(layoutTopology(ctrs, nets), { zones: {}, nodes: {} });
    expect(pinned).not.toBeNull();
    const again = pinAutoPositions(
      layoutTopology(ctrs, nets, pinned ?? undefined),
      pinned ?? { zones: {}, nodes: {} },
    );
    expect(again).toBeNull();
  });

  it("keeps every box where it was when a network or a container appears later", () => {
    const pinned = pinAutoPositions(layoutTopology(ctrs, nets), { zones: {}, nodes: {} }) ?? {
      zones: {},
      nodes: {},
    };
    const before = spots(layoutTopology(ctrs, nets, pinned));
    // A network that sorts first, and a container in the middle of an existing box.
    const more = layoutTopology(
      [...ctrs, ctr("z", ["edge"])],
      [net("0", "alpha"), ...nets],
      pinned,
    );
    const after = spots(more);
    for (const key of Object.keys(before)) expect(after[key]).toEqual(before[key]);
  });

  it("puts a new container in a free slot, never on top of one the person moved", () => {
    const saved = { zones: {}, nodes: { a: { x: 24, y: 76 } } }; // exactly the first automatic slot
    const t = layoutTopology([ctr("a", ["edge"]), ctr("n", ["edge"])], nets, saved);
    const a = t.placements.find((p) => p.name === "a");
    const n = t.placements.find((p) => p.name === "n");
    const overlap = a && n && Math.abs(a.x - n.x) < NODE_W && Math.abs(a.y - n.y) < NODE_H;
    expect(overlap).toBe(false);
  });
});
