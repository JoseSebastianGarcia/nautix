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

  it("builds an isolated network command", () => {
    expect(cli.createNetwork("backend", true, "10.0.0.0/24")).toBe(
      "docker network create --internal --subnet 10.0.0.0/24 backend",
    );
  });
});
