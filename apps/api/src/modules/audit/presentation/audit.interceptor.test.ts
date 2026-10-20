import { describe, expect, it } from "vitest";
import { auditAction } from "./audit.interceptor.js";

describe("auditAction", () => {
  it("folds container ids and keeps names", () => {
    const id = "a".repeat(64);
    expect(auditAction("DELETE", `/api/v1/containers/${id}`)).toBe("DELETE /api/v1/containers/:id");
    expect(auditAction("POST", `/api/v1/containers/${id}/stop`)).toBe(
      "POST /api/v1/containers/:id/stop",
    );
    expect(auditAction("PUT", "/api/v1/gateways/kong/routes")).toBe(
      "PUT /api/v1/gateways/kong/routes",
    );
  });
});
