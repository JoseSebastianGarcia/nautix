import type { Container, Image, Network, Volume } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { summarizeDf } from "./disk-usage.js";
import { previewPrune } from "./prune-preview.js";

const c = (name: string, state: Container["state"], isSelf = false): Container => ({
  id: name,
  name,
  image: "i",
  state,
  status: "",
  createdAt: 0,
  ports: [],
  networks: [],
  labels: {},
  ...(isSelf ? { isSelf } : {}),
});
const img = (tags: string[], inUse: boolean, size = 100): Image => ({
  id: `sha256:${tags[0] ?? "dangling"}-abcdefghijkl`,
  tags,
  size,
  createdAt: 0,
  inUse,
});
const vol = (name: string, inUse: boolean): Volume => ({
  name,
  driver: "local",
  mountpoint: "/x",
  createdAt: null,
  inUse,
});
const net = (name: string, members: number, system = false): Network => ({
  id: name,
  name,
  driver: "bridge",
  internal: false,
  subnet: null,
  containerIds: Array(members).fill("x"),
  system,
});

const inv = {
  containers: [c("up", "running"), c("old", "exited"), c("nautix", "exited", true)],
  images: [img(["a:1"], true), img(["b:1"], false, 300), img([], false, 50)],
  volumes: [vol("keep", true), vol("orphan", false)],
  networks: [net("bridge", 0, true), net("used", 2), net("empty", 0)],
};

describe("previewPrune", () => {
  it("names what to delete: ids for containers, images and networks, the name for a volume", () => {
    expect(previewPrune("containers", inv, false).items[0]?.id).toBe("old");
    expect(previewPrune("images", inv, true).items.map((i) => i.id)).toEqual([
      "sha256:b:1-abcdefghijkl",
      "sha256:dangling-abcdefghijkl",
    ]);
    expect(previewPrune("volumes", inv, false).items[0]?.id).toBe("orphan");
    expect(previewPrune("networks", inv, false).items[0]?.id).toBe("empty");
  });

  it("lists stopped containers and never offers Nautix itself", () => {
    expect(previewPrune("containers", inv, false).items.map((i) => i.name)).toEqual(["old"]);
  });

  it("images: dangling only, or all unused with `all`", () => {
    expect(previewPrune("images", inv, false)).toMatchObject({
      items: [{ size: 50 }],
      reclaimableBytes: 50,
    });
    expect(previewPrune("images", inv, true).reclaimableBytes).toBe(350);
  });

  it("volumes and networks that nothing uses", () => {
    expect(previewPrune("volumes", inv, false).items.map((i) => i.name)).toEqual(["orphan"]);
    expect(previewPrune("networks", inv, false).items.map((i) => i.name)).toEqual(["empty"]);
  });
});

describe("summarizeDf", () => {
  it("builds the docker system df buckets", () => {
    const df = summarizeDf({
      Images: [
        { Size: 100, Containers: 1 },
        { Size: 40, Containers: 0 },
      ],
      Containers: [
        { State: "running", SizeRw: 5 },
        { State: "exited", SizeRw: 7 },
      ],
      Volumes: [{ UsageData: { Size: 10, RefCount: 1 } }, { UsageData: { Size: -1, RefCount: 0 } }],
      BuildCache: [{ Size: 30, InUse: false }],
    });
    expect(df.images).toEqual({ count: 2, active: 1, sizeBytes: 140, reclaimableBytes: 40 });
    expect(df.containers).toEqual({ count: 2, active: 1, sizeBytes: 12, reclaimableBytes: 7 });
    expect(df.volumes).toEqual({ count: 2, active: 1, sizeBytes: 10, reclaimableBytes: 0 });
    expect(df.buildCache.reclaimableBytes).toBe(30);
  });

  it("copes with an empty daemon", () => {
    expect(summarizeDf({}).images).toEqual({
      count: 0,
      active: 0,
      sizeBytes: 0,
      reclaimableBytes: 0,
    });
  });
});
