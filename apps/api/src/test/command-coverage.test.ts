import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

const matrix = read("docs/spec/05-commands.md");
const help = read("corpus/docker-help.txt");

/** Rows of every table in the matrix: | command | route | ui | milestone | status |. */
const rows = [
  ...matrix.matchAll(/^\| ([a-z][a-z-]*) \|.*\| (Done|Partial|Planned|[A-Za-z]+) \|$/gm),
].map((m) => ({
  command: m[1] as string,
  status: m[2] as string,
}));

/** Top-level commands listed by `docker --help` (corpus captured from the real CLI). */
const helpCommands = [...help.matchAll(/^\s{2}([a-z][a-z-]*)\*?\s{2,}\S/gm)].map(
  (m) => m[1] as string,
);

describe("docker command coverage matrix", () => {
  it("reads the corpus", () => {
    expect(helpCommands.length).toBeGreaterThan(40);
    expect(helpCommands).toEqual(expect.arrayContaining(["run", "ps", "compose", "system"]));
  });

  it("lists every command that `docker --help` shows (nothing is silently missing)", () => {
    const listed = new Set(rows.map((r) => r.command));
    expect(helpCommands.filter((c) => !listed.has(c))).toEqual([]);
  });

  it("gives every row a known status and no duplicates", () => {
    expect(rows.filter((r) => !["Done", "Partial", "Planned"].includes(r.status))).toEqual([]);
    const names = rows.map((r) => r.command);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("does not claim commands that docker no longer has", () => {
    const known = new Set(helpCommands);
    expect(rows.map((r) => r.command).filter((c) => !known.has(c))).toEqual([]);
  });
});
