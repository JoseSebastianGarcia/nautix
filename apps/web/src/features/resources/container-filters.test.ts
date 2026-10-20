import type { Container } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { composeProjects, filterContainers, NO_FILTER } from "./container-filters.js";

const c = (name: string, state: string, labels: Record<string, string> = {}): Container =>
  ({ id: `${name}-id`, name, image: `${name}:1`, state, labels }) as unknown as Container;

const all = [
  c("web", "running", { "com.docker.compose.project": "shop", tier: "front" }),
  c("db", "exited", { "com.docker.compose.project": "shop" }),
  c("solo", "running"),
];

describe("filterContainers", () => {
  it("keeps everything with no filter", () => {
    expect(filterContainers(all, NO_FILTER)).toHaveLength(3);
  });

  it("filters by text, status, project and label", () => {
    expect(filterContainers(all, { ...NO_FILTER, text: "WE" }).map((x) => x.name)).toEqual(["web"]);
    expect(filterContainers(all, { ...NO_FILTER, status: "running" }).map((x) => x.name)).toEqual([
      "web",
      "solo",
    ]);
    expect(filterContainers(all, { ...NO_FILTER, status: "stopped" }).map((x) => x.name)).toEqual([
      "db",
    ]);
    expect(filterContainers(all, { ...NO_FILTER, project: "shop" })).toHaveLength(2);
    expect(filterContainers(all, { ...NO_FILTER, label: "tier" }).map((x) => x.name)).toEqual([
      "web",
    ]);
    expect(filterContainers(all, { ...NO_FILTER, label: "tier=back" })).toHaveLength(0);
    expect(filterContainers(all, { ...NO_FILTER, label: "tier=front" })).toHaveLength(1);
  });

  it("lists compose projects once", () => {
    expect(composeProjects(all)).toEqual(["shop"]);
  });
});
