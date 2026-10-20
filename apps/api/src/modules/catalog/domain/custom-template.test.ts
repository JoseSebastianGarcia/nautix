import { CustomTemplateInput } from "@nautix/contracts";
import { describe, expect, it } from "vitest";
import { customTemplateId, toTemplate } from "./custom-template.js";

describe("custom templates", () => {
  it("derives a stable slug id", () => {
    expect(customTemplateId("My API (v2)!")).toBe("custom-my-api-v2");
    expect(customTemplateId("   ")).toBe("custom-template");
    expect(customTemplateId("Mi API")).toBe(customTemplateId("mi  api"));
  });

  it("maps an input to a template flagged as custom", () => {
    const t = toTemplate(
      CustomTemplateInput.parse({
        name: "Mi API",
        image: "ghcr.io/acme/api:1.0",
        ports: [{ containerPort: 8080 }],
        env: { LOG: "debug" },
        volumes: ["/data"],
      }),
    );
    expect(t).toMatchObject({
      id: "custom-mi-api",
      category: "custom",
      custom: true,
      ports: [{ containerPort: 8080, label: "8080" }],
      env: { LOG: "debug" },
      volumes: ["/data"],
    });
    expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps protocol and host port so DNS-style templates deploy as saved", () => {
    const t = toTemplate(
      CustomTemplateInput.parse({
        name: "Mi DNS",
        image: "x/dns:1",
        ports: [{ containerPort: 53, protocol: "udp", hostPort: 5353 }],
      }),
    );
    expect(t.ports).toEqual([{ containerPort: 53, label: "53", protocol: "udp", hostPort: 5353 }]);
  });

  it("rejects bad input", () => {
    expect(() => CustomTemplateInput.parse({ name: "", image: "x" })).toThrow();
    expect(() =>
      CustomTemplateInput.parse({ name: "a", image: "x", ports: [{ containerPort: 70000 }] }),
    ).toThrow();
  });
});
