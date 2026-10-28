import { describe, expect, it } from "vitest";
import {
  type BulkItem,
  bulkCommands,
  orderForRemoval,
  removeAll,
  selectAll,
  systemPruneCommand,
  toggled,
} from "./bulk.js";

const c = (name: string, running = false): BulkItem => ({
  kind: "containers",
  id: `id-${name}`,
  name,
  running,
});
const n = (name: string): BulkItem => ({ kind: "networks", id: `net-${name}`, name });
const i = (name: string): BulkItem => ({ kind: "images", id: `img-${name}`, name });
const v = (name: string): BulkItem => ({ kind: "volumes", id: name, name });

describe("orderForRemoval", () => {
  it("removes containers first, then networks, images and volumes, keeping the rest in order", () => {
    const items = [v("data"), i("old"), n("net"), c("a"), c("b")];
    expect(orderForRemoval(items).map((x) => x.name)).toEqual(["a", "b", "net", "old", "data"]);
  });

  it("does not change the list it was given", () => {
    const items = [v("data"), c("a")];
    orderForRemoval(items);
    expect(items.map((x) => x.name)).toEqual(["data", "a"]);
  });
});

describe("removeAll", () => {
  it("removes every item and reports them", async () => {
    const seen: string[] = [];
    const result = await removeAll([c("a"), n("net")], async (item) => {
      seen.push(item.name);
    });
    expect(seen).toEqual(["a", "net"]);
    expect(result.removed.map((x) => x.name)).toEqual(["a", "net"]);
    expect(result.failed).toEqual([]);
  });

  it("keeps going after a failure and says which one failed and why", async () => {
    const result = await removeAll([c("a"), i("busy"), v("data")], async (item) => {
      if (item.name === "busy") throw new Error("image is in use");
    });
    expect(result.removed.map((x) => x.name)).toEqual(["a", "data"]);
    expect(result.failed).toEqual([{ item: i("busy"), reason: "image is in use" }]);
  });

  it("removes in the safe order even when the selection is not", async () => {
    const seen: string[] = [];
    await removeAll([v("data"), c("a")], async (item) => {
      seen.push(item.kind);
    });
    expect(seen).toEqual(["containers", "volumes"]);
  });

  it("reports progress after each item", async () => {
    const steps: number[] = [];
    await removeAll(
      [c("a"), c("b"), c("c")],
      async () => {},
      (done) => steps.push(done),
    );
    expect(steps).toEqual([1, 2, 3]);
  });
});

describe("bulkCommands", () => {
  it("writes one docker line per kind, with the names", () => {
    expect(bulkCommands([c("a"), c("b"), n("net"), i("nginx:1"), v("data")])).toEqual([
      "docker rm a b",
      "docker network rm net",
      "docker rmi nginx:1",
      "docker volume rm data",
    ]);
  });

  it("adds -f when a selected container is running, because the removal is forced", () => {
    expect(bulkCommands([c("a", true), c("b")])).toEqual(["docker rm -f a b"]);
  });

  it("is empty for an empty selection", () => {
    expect(bulkCommands([])).toEqual([]);
  });
});

describe("systemPruneCommand", () => {
  it("is plain docker system prune by default", () => {
    expect(systemPruneCommand({ images: false, volumes: false })).toBe("docker system prune");
  });

  it("adds -a for unused images and --volumes for volumes, which hold data", () => {
    expect(systemPruneCommand({ images: true, volumes: false })).toBe("docker system prune -a");
    expect(systemPruneCommand({ images: false, volumes: true })).toBe(
      "docker system prune --volumes",
    );
    expect(systemPruneCommand({ images: true, volumes: true })).toBe(
      "docker system prune -a --volumes",
    );
  });
});

describe("selection helpers", () => {
  it("toggles a key without touching the original set", () => {
    const start = new Set(["a"]);
    const added = toggled(start, "b");
    expect([...added].sort()).toEqual(["a", "b"]);
    expect([...toggled(added, "a")]).toEqual(["b"]);
    expect([...start]).toEqual(["a"]);
  });

  it("selects every key, or none when they all are selected already", () => {
    expect([...selectAll(["a", "b"], new Set())].sort()).toEqual(["a", "b"]);
    expect([...selectAll(["a", "b"], new Set(["a", "b"]))]).toEqual([]);
    expect([...selectAll(["a", "b"], new Set(["a"]))].sort()).toEqual(["a", "b"]);
  });
});
