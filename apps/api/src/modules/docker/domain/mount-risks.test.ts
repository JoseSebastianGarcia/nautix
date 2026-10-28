import { bindString, missingConsent, mountRisks, parseBind } from "@nautix/contracts";
import { describe, expect, it } from "vitest";

describe("parseBind", () => {
  it("splits source, target and the read-only flag", () => {
    expect(parseBind("/srv/data:/data")).toEqual({
      source: "/srv/data",
      target: "/data",
      readOnly: false,
    });
    expect(parseBind("/srv/data:/data:ro")).toEqual({
      source: "/srv/data",
      target: "/data",
      readOnly: true,
    });
  });

  it("keeps a Windows drive letter in the source", () => {
    expect(parseBind("C:\\data:/data")).toEqual({
      source: "C:\\data",
      target: "/data",
      readOnly: false,
    });
  });

  it("is null for something that is not a bind", () => {
    expect(parseBind("")).toBeNull();
    expect(parseBind("just-a-name")).toBeNull();
  });
});

describe("bindString", () => {
  it("writes the Docker form, with :ro only when read-only", () => {
    expect(bindString({ source: "/a", target: "/b", readOnly: false })).toBe("/a:/b");
    expect(bindString({ source: "/a", target: "/b", readOnly: true })).toBe("/a:/b:ro");
  });
});

describe("mountRisks", () => {
  it("is empty for named volumes and ordinary folders", () => {
    expect(mountRisks(["orders-data:/var/lib/postgresql/data"])).toEqual([]);
    expect(mountRisks(["/srv/app/config:/etc/app:ro"])).toEqual([]);
    expect(mountRisks(["/home/ana/site:/usr/share/nginx/html"])).toEqual([]);
  });

  it("flags the Docker socket, however it is spelled", () => {
    for (const bind of [
      "/var/run/docker.sock:/var/run/docker.sock",
      "/run/docker.sock:/var/run/docker.sock",
      "/var/run//docker.sock:/sock",
      "/var/run/../run/docker.sock:/sock",
      "/var/run/docker.sock:/var/run/docker.sock:ro",
      "\\\\.\\pipe\\docker_engine:\\\\.\\pipe\\docker_engine",
    ])
      expect(mountRisks([bind])).toContain("docker-socket");
  });

  it("flags the folders that contain the socket", () => {
    expect(mountRisks(["/var/run:/host-run"])).toContain("docker-socket");
    expect(mountRisks(["/run:/host-run"])).toContain("docker-socket");
  });

  it("flags the host root", () => {
    expect(mountRisks(["/:/host"])).toContain("host-root");
    expect(mountRisks(["C:\\:/host"])).toContain("host-root");
    expect(mountRisks(["//:/host"])).toContain("host-root");
  });

  it("flags sensitive host folders and anything under them", () => {
    for (const source of [
      "/etc",
      "/etc/ssh",
      "/root",
      "/boot",
      "/proc",
      "/sys",
      "/dev",
      "/var/lib/docker",
      "/var/lib/docker/volumes",
    ])
      expect(mountRisks([`${source}:/x`])).toContain("sensitive-path");
  });

  it("flags a parent of a sensitive folder", () => {
    expect(mountRisks(["/var/lib:/x"])).toContain("sensitive-path");
    expect(mountRisks(["/var:/x"])).toContain("sensitive-path");
  });

  it("does not mistake look-alike names for sensitive ones", () => {
    expect(mountRisks(["/etcetera/data:/x"])).toEqual([]);
    expect(mountRisks(["/srv/etc:/x"])).toEqual([]);
    expect(mountRisks(["/var/lib/dockerish:/x"])).toEqual([]);
  });

  it("lists each risk once, in a stable order", () => {
    expect(
      mountRisks(["/var/run/docker.sock:/a", "/var/run/docker.sock:/b", "/etc:/c", "/:/d"]),
    ).toEqual(["docker-socket", "host-root", "sensitive-path"]);
  });
});

describe("missingConsent", () => {
  it("names the risks that were not accepted", () => {
    const binds = ["/var/run/docker.sock:/var/run/docker.sock", "/etc:/x"];
    expect(missingConsent(binds, [])).toEqual(["docker-socket", "sensitive-path"]);
    expect(missingConsent(binds, ["docker-socket"])).toEqual(["sensitive-path"]);
    expect(missingConsent(binds, ["docker-socket", "sensitive-path"])).toEqual([]);
  });

  it("asks for nothing when there is no risk", () => {
    expect(missingConsent(["data:/data"], [])).toEqual([]);
  });
});
