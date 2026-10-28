import { describe, expect, it } from "vitest";
import { cli } from "./cli.js";

describe("cli", () => {
  it("builds a run command that binds to loopback by default", () => {
    expect(
      cli.run({
        name: "web",
        image: "nginx",
        network: "edge",
        ports: [{ host: 8080, container: 80, pub: false }],
      }),
    ).toBe("docker run -d --name web --network edge -p 127.0.0.1:8080:80 nginx");
  });

  it("binds to the chosen host address when one is given", () => {
    expect(
      cli.run({
        name: "db",
        image: "postgres",
        ports: [{ host: 5432, container: 5432, pub: false, ip: "10.0.0.2" }],
      }),
    ).toBe("docker run -d --name db -p 10.0.0.2:5432:5432 postgres");
  });

  it("builds an isolated network command", () => {
    expect(cli.createNetwork("shop", false, undefined, { encrypted: true, attachable: true })).toBe(
      "docker network create -d overlay --opt encrypted --attachable shop",
    );
    expect(cli.createNetwork("backend", true, "10.0.0.0/24")).toBe(
      "docker network create --internal --subnet 10.0.0.0/24 backend",
    );
  });

  it("adds --restart only when a policy is set", () => {
    const base = { name: "w", image: "nginx", ports: [] };
    expect(cli.run({ ...base, restart: "unless-stopped" })).toBe(
      "docker run -d --name w --restart unless-stopped nginx",
    );
    expect(cli.run({ ...base, restart: "no" })).toBe("docker run -d --name w nginx");
  });

  it("shows folder mappings as -v flags in the docker run line", () => {
    const line = cli.run({
      name: "az",
      image: "floci/floci-az:latest",
      ports: [],
      mounts: ["/var/run/docker.sock:/var/run/docker.sock", "/srv/site:/html:ro"],
    });
    expect(line).toContain("-v /var/run/docker.sock:/var/run/docker.sock");
    expect(line).toContain("-v /srv/site:/html:ro");
    expect(line.indexOf("-v ")).toBeLessThan(line.indexOf("floci/floci-az"));
  });
});
