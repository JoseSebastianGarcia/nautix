import { describe, expect, it } from "vitest";
import { normaliseServer, registryOf, serverAddress } from "./registry-host.js";

describe("registry host", () => {
  it("folds Docker Hub aliases and strips scheme and path", () => {
    expect(normaliseServer("https://index.docker.io/v1/")).toBe("docker.io");
    expect(normaliseServer("GHCR.io")).toBe("ghcr.io");
    expect(normaliseServer("https://registry.example.com:5000/x")).toBe(
      "registry.example.com:5000",
    );
  });

  it("finds the registry of an image reference", () => {
    expect(registryOf("nginx:1.27")).toBe("docker.io");
    expect(registryOf("acme/app:1")).toBe("docker.io");
    expect(registryOf("ghcr.io/acme/app:1")).toBe("ghcr.io");
    expect(registryOf("localhost:5000/app")).toBe("localhost:5000");
    expect(registryOf("localhost/app")).toBe("localhost");
  });

  it("uses the v1 address for Docker Hub", () => {
    expect(serverAddress("docker.io")).toBe("https://index.docker.io/v1/");
    expect(serverAddress("ghcr.io")).toBe("ghcr.io");
  });
});
