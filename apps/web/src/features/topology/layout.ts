import type { Layout, Network } from "@nautix/contracts";

/** What the layout needs of a thing drawn inside a box: containers and swarm services both fit. */
export interface Placeable {
  id: string;
  /** Key under which its position is saved. */
  name: string;
  /** Names of the networks it belongs to. */
  networks: string[];
}

export const NODE_W = 220;
export const NODE_H = 72;
const GAP = 24;
const PAD = 24;
const HEADER = 52;
const ZONE_GAP = 56;
const ROW_WIDTH = 1280;
const MAX_COLS = 2;
const MIN_ZONE_W = 300;

export const EXTERNAL_ID = "external";

const NO_LAYOUT: Layout = { zones: {}, nodes: {} };
const MIN_OFFSET_X = 8;

/** Key under which a zone's position is saved: the network name, or "external". */
export const zoneKey = (zone: { id: string; network: Network | null }): string =>
  zone.network?.name ?? EXTERNAL_ID;

export interface ZoneLayout {
  /** Network id, or EXTERNAL_ID for the "outside" frame. */
  id: string;
  network: Network | null;
  x: number;
  y: number;
  w: number;
  h: number;
  containerIds: string[];
}

export interface Placement {
  containerId: string;
  /** The container's name: the key its box-relative spot is saved under. */
  name: string;
  zoneId: string;
  /** Absolute canvas position of the node. */
  x: number;
  y: number;
}

export interface Link {
  containerId: string;
  zoneId: string;
}

export interface Topology {
  zones: ZoneLayout[];
  placements: Placement[];
  /** Containers that also belong to zones other than their primary one. */
  links: Link[];
}

const isZoneNetwork = (n: Network): boolean => !n.system;

const size = (count: number): { w: number; h: number; cols: number } => {
  const cols = Math.max(1, Math.min(MAX_COLS, count));
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    cols,
    w: Math.max(MIN_ZONE_W, cols * NODE_W + (cols - 1) * GAP + PAD * 2),
    h: HEADER + rows * NODE_H + (rows - 1) * GAP + PAD * 2,
  };
};

/**
 * Pure auto-layout. A container sits in the first user-defined network it belongs to
 * (its "zone"); extra memberships become links. Containers with no user network sit in
 * the external frame — they share nothing with the zones.
 */
export const layoutTopology = <C extends Placeable>(
  containers: C[],
  networks: Network[],
  saved: Layout = NO_LAYOUT,
): Topology => {
  // Docker lists networks and containers in no fixed order. Sorting by name makes the automatic spots depend
  // only on what exists, so a refresh can never shuffle boxes the person has not placed (ADR-061).
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const userNetworks = networks.filter(isZoneNetwork).sort(byName);
  const networkByName = new Map(userNetworks.map((n) => [n.name, n]));

  const members = new Map<string, C[]>();
  const external: C[] = [];
  const links: Link[] = [];

  for (const c of [...containers].sort(byName)) {
    const mine = c.networks
      .map((name) => networkByName.get(name))
      .filter((n): n is Network => n !== undefined);
    const [primary, ...rest] = mine;
    if (!primary) {
      external.push(c);
      continue;
    }
    members.set(primary.id, [...(members.get(primary.id) ?? []), c]);
    for (const extra of rest) links.push({ containerId: c.id, zoneId: extra.id });
  }

  const zones: ZoneLayout[] = [];
  const placements: Placement[] = [];

  const place = (
    id: string,
    network: Network | null,
    list: C[],
    x: number,
    y: number,
  ): ZoneLayout => {
    const auto = size(list.length);
    // A saved zone position wins over the automatic flow.
    const origin = saved.zones[network?.name ?? EXTERNAL_ID] ?? { x, y };
    let maxRight = 0;
    let maxBottom = 0;
    const clamp = (o: { x: number; y: number }) => ({
      x: Math.max(MIN_OFFSET_X, o.x),
      y: Math.max(HEADER, o.y),
    });
    // Spots already used by containers that were placed (by hand or pinned): new ones go around them.
    const taken = list.flatMap((c) => {
      const o = saved.nodes[c.name];
      return o ? [clamp(o)] : [];
    });
    const freeSlot = (): { x: number; y: number } => {
      for (let k = 0; ; k++) {
        const slot = {
          x: PAD + (k % auto.cols) * (NODE_W + GAP),
          y: HEADER + PAD + Math.floor(k / auto.cols) * (NODE_H + GAP),
        };
        if (
          !taken.some((t) => Math.abs(t.x - slot.x) < NODE_W && Math.abs(t.y - slot.y) < NODE_H)
        ) {
          taken.push(slot);
          return slot;
        }
      }
    };
    list.forEach((c) => {
      const savedOffset = saved.nodes[c.name];
      const offset = savedOffset ? clamp(savedOffset) : freeSlot();
      maxRight = Math.max(maxRight, offset.x + NODE_W + PAD);
      maxBottom = Math.max(maxBottom, offset.y + NODE_H + PAD);
      placements.push({
        containerId: c.id,
        name: c.name,
        zoneId: id,
        x: origin.x + offset.x,
        y: origin.y + offset.y,
      });
    });
    // The box grows to keep every (possibly moved) container inside it.
    const zone = {
      id,
      network,
      x: origin.x,
      y: origin.y,
      w: Math.max(auto.w, maxRight),
      h: Math.max(auto.h, maxBottom),
      containerIds: list.map((c) => c.id),
    };
    zones.push(zone);
    return zone;
  };

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const advance = (zone: ZoneLayout, slot: { w: number; h: number }): void => {
    cursorX += Math.max(zone.w, slot.w) + ZONE_GAP;
    rowHeight = Math.max(rowHeight, Math.max(zone.h, slot.h));
  };
  const wrapIfNeeded = (nextWidth: number): void => {
    if (cursorX > 0 && cursorX + nextWidth > ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + ZONE_GAP;
      rowHeight = 0;
    }
  };

  wrapIfNeeded(size(external.length).w);
  advance(place(EXTERNAL_ID, null, external, cursorX, cursorY), size(external.length));

  for (const network of userNetworks) {
    const list = members.get(network.id) ?? [];
    wrapIfNeeded(size(list.length).w);
    advance(place(network.id, network, list, cursorX, cursorY), size(list.length));
  }

  return { zones, placements, links };
};

/** Which zone contains a point (used for drag/drop). External is a normal zone. */
export const zoneAt = (zones: ZoneLayout[], x: number, y: number): ZoneLayout | undefined =>
  zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);

/**
 * What the layout still has no saved spot for, filled in with where the automatic layout put it, so that
 * the first time a canvas is shown its boxes and containers stop depending on what comes later. Returns null
 * when everything is pinned already (nothing to save). Container spots are relative to their box, like a drag.
 */
export const pinAutoPositions = (topology: Topology, saved: Layout): Layout | null => {
  const zones = { ...saved.zones };
  const nodes = { ...saved.nodes };
  let changed = false;
  for (const zone of topology.zones) {
    const key = zoneKey(zone);
    if (!zones[key]) {
      zones[key] = { x: zone.x, y: zone.y };
      changed = true;
    }
  }
  for (const p of topology.placements) {
    const zone = topology.zones.find((z) => z.id === p.zoneId);
    if (!nodes[p.name] && zone) {
      nodes[p.name] = { x: p.x - zone.x, y: p.y - zone.y };
      changed = true;
    }
  }
  return changed ? { ...saved, zones, nodes } : null;
};
