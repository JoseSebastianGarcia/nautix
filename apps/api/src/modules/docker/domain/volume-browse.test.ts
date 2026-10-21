import { describe, expect, it } from "vitest";
import { cleanVolumePath, mountedPath, parseLs, volumeNamesIn } from "./volume-browse.js";

describe("volume paths", () => {
  it("normalises and stays inside the volume", () => {
    expect(cleanVolumePath("")).toBe("/");
    expect(cleanVolumePath("/")).toBe("/");
    expect(cleanVolumePath("data//logs/")).toBe("/data/logs");
    expect(mountedPath("/")).toBe("/v");
    expect(mountedPath("/data")).toBe("/v/data");
    expect(() => cleanVolumePath("../etc")).toThrow();
    expect(() => cleanVolumePath("a/../../b")).toThrow();
    expect(() => cleanVolumePath("a\0b")).toThrow();
  });
});

describe("parseLs", () => {
  it("parses busybox listings, directories first", () => {
    const out = [
      "total 12",
      "-rw-r--r--    1 root     root            12 Oct 20 12:00 notes.txt",
      "drwxr-xr-x    2 root     root          4096 Oct 20 12:00 logs/",
      "lrwxrwxrwx    1 root     root             8 Oct 20 12:00 current -> logs/a.log",
      "-rw-r--r--    1 70       70              99 Jan  3  2024 with space.conf",
    ].join("\n");
    const entries = parseLs(out);
    expect(entries.map((e) => [e.name, e.kind])).toEqual([
      ["logs", "dir"],
      ["current", "link"],
      ["notes.txt", "file"],
      ["with space.conf", "file"],
    ]);
    expect(entries.find((e) => e.name === "notes.txt")?.size).toBe(12);
    expect(parseLs("")).toEqual([]);
  });
});

describe("volumeNamesIn", () => {
  it("takes the named volumes from the mounts of an inspected container", () => {
    expect(
      volumeNamesIn({
        Mounts: [
          { Type: "volume", Name: "nautix-data" },
          { Type: "bind", Source: "/var/run/docker.sock" },
          { Type: "volume", Name: "cache" },
        ],
      }),
    ).toEqual(["nautix-data", "cache"]);
    expect(volumeNamesIn({})).toEqual([]);
    expect(volumeNamesIn(null)).toEqual([]);
  });
});
