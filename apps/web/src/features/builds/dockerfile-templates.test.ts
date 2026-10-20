import { lintDockerfile } from "@nautix/dockerfile";
import { describe, expect, it } from "vitest";
import { DOCKERFILE_TEMPLATES } from "./dockerfile-templates.js";

describe("Dockerfile templates", () => {
  it.each(DOCKERFILE_TEMPLATES.map((t) => [t.id, t.dockerfile] as const))(
    "%s has no warnings or errors",
    (_id, dockerfile) => {
      expect(lintDockerfile(dockerfile).filter((i) => i.severity !== "info")).toEqual([]);
    },
  );
});
