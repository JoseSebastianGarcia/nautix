import type { Container, Network } from "@nautix/contracts";

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
export const layoutTopology = (containers: Container[], networks: Network[]): Topology => {
  const userNetworks = networks.filter(isZoneNetwork);
  const byName = new Map(userNetworks.map((n) => [n.name, n]));

  const members = new Map<string, Container[]>();
  const external: Container[] = [];
  const links: Link[] = [];

  for (const c of containers) {
    const mine = c.networks
      .map((name) => byName.get(name))
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
    list: Container[],
    x: number,
    y: number,
  ): ZoneLayout => {
    const { w, h, cols } = size(list.length);
    list.forEach((c, i) => {
      placements.push({
        containerId: c.id,
        zoneId: id,
        x: x + PAD + (i % cols) * (NODE_W + GAP),
        y: y + HEADER + PAD + Math.floor(i / cols) * (NODE_H + GAP),
      });
    });
    const zone = { id, network, x, y, w, h, containerIds: list.map((c) => c.id) };
    zones.push(zone);
    return zone;
  };

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const advance = (zone: ZoneLayout): void => {
    cursorX += zone.w + ZONE_GAP;
    rowHeight = Math.max(rowHeight, zone.h);
  };
  const wrapIfNeeded = (nextWidth: number): void => {
    if (cursorX > 0 && cursorX + nextWidth > ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + ZONE_GAP;
      rowHeight = 0;
    }
  };

  wrapIfNeeded(size(external.length).w);
  advance(place(EXTERNAL_ID, null, external, cursorX, cursorY));

  for (const network of userNetworks) {
    const list = members.get(network.id) ?? [];
    wrapIfNeeded(size(list.length).w);
    advance(place(network.id, network, list, cursorX, cursorY));
  }

  return { zones, placements, links };
};

/** Which zone contains a point (used for drag/drop). External is a normal zone. */
export const zoneAt = (zones: ZoneLayout[], x: number, y: number): ZoneLayout | undefined =>
  zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
