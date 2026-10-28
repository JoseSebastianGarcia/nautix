import { describe, expect, it } from "vitest";
import { nameMatches } from "./confirm-name.js";

describe("nameMatches", () => {
  it("accepts the exact name", () => {
    expect(nameMatches("orders-api", "orders-api")).toBe(true);
  });

  it("ignores spaces around what was typed, nothing else", () => {
    expect(nameMatches("  orders-api ", "orders-api")).toBe(true);
    expect(nameMatches("orders api", "orders-api")).toBe(false);
  });

  it("is case sensitive: a different name is a different object", () => {
    expect(nameMatches("Orders-API", "orders-api")).toBe(false);
  });

  it("never matches an empty name, so an empty field cannot unlock the button", () => {
    expect(nameMatches("", "")).toBe(false);
    expect(nameMatches("  ", "")).toBe(false);
  });

  it("does not match a prefix or an extension", () => {
    expect(nameMatches("orders", "orders-api")).toBe(false);
    expect(nameMatches("orders-api-2", "orders-api")).toBe(false);
  });
});
