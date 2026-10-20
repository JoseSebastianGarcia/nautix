import { describe, expect, it } from "vitest";
import { isIgnored, parseDockerignore } from "./dockerignore.js";
import { buildTar } from "./tar.js";

describe("dockerignore", () => {
  const rules = parseDockerignore("# c\n**/bin\n**/obj\n.git\n*.md\n!README.md\n/secrets/\n");
  it("ignores build output at any depth and whole directories", () => {
    expect(isIgnored(rules, "src/App/bin/Debug/a.dll")).toBe(true);
    expect(isIgnored(rules, "obj/x.json")).toBe(true);
    expect(isIgnored(rules, ".git/config")).toBe(true);
    expect(isIgnored(rules, "secrets/key.pem")).toBe(true);
  });
  it("keeps sources and honours negation", () => {
    expect(isIgnored(rules, "src/App/Program.cs")).toBe(false);
    expect(isIgnored(rules, "CHANGES.md")).toBe(true);
    expect(isIgnored(rules, "README.md")).toBe(false);
    expect(isIgnored(rules, "src/binary.cs")).toBe(false);
  });
});

describe("tar", () => {
  it("pads files to 512-byte blocks and ends with two empty blocks", async () => {
    const blob = buildTar([{ path: "a.txt", data: new Blob(["hi"]) }]);
    expect(blob.size).toBe(512 + 512 + 1024);
    const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
    expect(new TextDecoder().decode(head.subarray(0, 5))).toBe("a.txt");
  });
  it("splits long paths into prefix and name", () => {
    const path = `${"d".repeat(60)}/${"e".repeat(60)}/file.cs`;
    expect(() => buildTar([{ path, data: new Blob([]) }])).not.toThrow();
  });
});
