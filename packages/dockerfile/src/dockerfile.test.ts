import { describe, expect, it } from "vitest";
import { applyFix, lintDockerfile, parseDockerfile, RULES, stageGraph } from "./index.js";

const rules = (text: string): string[] => lintDockerfile(text).map((i) => i.rule);

const GOOD = `FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
HEALTHCHECK CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
`;

describe("parse", () => {
  it("joins continuations, skips comments and splits stages", () => {
    const df = parseDockerfile(
      'ARG V=1\nFROM alpine:3 AS base\n# note\nRUN a \\\n  # inner comment\n  && b\nFROM base\nCMD ["x"]\n',
    );
    expect(df.preamble.map((i) => i.keyword)).toEqual(["ARG"]);
    expect(df.stages.map((s) => [s.name, s.base])).toEqual([
      ["base", "alpine:3"],
      [null, "base"],
    ]);
    const run = df.instructions.find((i) => i.keyword === "RUN");
    expect(run).toMatchObject({ startLine: 4, endLine: 6 });
    expect(run?.args.replace(/\s+/g, " ")).toContain("a && b");
  });

  it("keeps heredoc bodies inside their instruction", () => {
    const df = parseDockerfile('FROM alpine:3\nRUN <<EOF\necho hi\nFROM fake\nEOF\nCMD ["x"]\n');
    expect(df.stages).toHaveLength(1);
    expect(df.instructions.find((i) => i.keyword === "RUN")?.endLine).toBe(5);
  });

  it("draws stage edges for FROM stage and COPY --from", () => {
    const g = stageGraph(parseDockerfile(GOOD));
    expect(g.nodes.map((n) => n.label)).toEqual(["build", "stage 1"]);
    expect(g.edges).toEqual([{ from: "s0", to: "s1", kind: "copy" }]);
    const chained = stageGraph(parseDockerfile("FROM a AS x\nFROM x AS y\nCOPY --from=0 /a /b\n"));
    expect(chained.edges).toEqual([
      { from: "s0", to: "s1", kind: "base" },
      { from: "s0", to: "s1", kind: "copy" },
    ]);
  });
});

describe("lint rules", () => {
  it("a good multi-stage file has no issues", () => {
    expect(lintDockerfile(GOOD)).toEqual([]);
  });

  const cases: [string, string, string][] = [
    [
      "NX-DF001",
      "FROM node\nUSER app\nHEALTHCHECK CMD true\n",
      "FROM node:22\nUSER app\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF002",
      "FROM alpine:3\nHEALTHCHECK CMD true\n",
      "FROM alpine:3\nUSER app\nHEALTHCHECK CMD true\n",
    ],
    ["NX-DF003", "FROM alpine:3\nUSER app\n", "FROM alpine:3\nUSER app\nHEALTHCHECK CMD true\n"],
    [
      "NX-DF004",
      "FROM alpine:3\nADD . /app\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM alpine:3\nCOPY . /app\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF005",
      "FROM alpine:3\nENV DB_PASSWORD=hunter2\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM alpine:3\nENV DB_HOST=db\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF006",
      "FROM alpine:3\nRUN curl -fsSL https://x.sh | sh\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM alpine:3\nRUN curl -fsSL -o /x.sh https://x.sh\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF007",
      "FROM debian:12\nRUN apt-get update\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM debian:12\nRUN apt-get update && apt-get install -y --no-install-recommends curl\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF008",
      "FROM debian:12\nRUN apt-get update && apt-get install -y curl\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM debian:12\nRUN apt-get update && apt-get install --no-install-recommends -y curl\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF009",
      "FROM alpine:3\nWORKDIR app\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM alpine:3\nWORKDIR /app\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF010",
      'FROM alpine:3\nCMD ["a"]\nCMD ["b"]\nUSER a\nHEALTHCHECK CMD true\n',
      'FROM alpine:3\nCMD ["b"]\nUSER a\nHEALTHCHECK CMD true\n',
    ],
    ["NX-DF011", "RUN echo hi\n", "FROM alpine:3\nUSER a\nHEALTHCHECK CMD true\n"],
    [
      "NX-DF012",
      "FROM alpine:3\nRUNN echo\nUSER a\nHEALTHCHECK CMD true\n",
      "FROM alpine:3\nRUN echo\nUSER a\nHEALTHCHECK CMD true\n",
    ],
    [
      "NX-DF013",
      "FROM alpine:3\nCMD node app.js\nUSER a\nHEALTHCHECK CMD true\n",
      'FROM alpine:3\nCMD ["node","app.js"]\nUSER a\nHEALTHCHECK CMD true\n',
    ],
  ];

  it.each(cases)("%s fires on the bad file and not on the good one", (rule, bad, good) => {
    expect(rules(bad)).toContain(rule);
    expect(rules(good)).not.toContain(rule);
  });

  it("has a case for every rule", () => {
    expect(cases.map((c) => c[0]).sort()).toEqual([...RULES].sort());
  });

  it("does not flag scratch, stage references, digests or variables as unpinned", () => {
    const text =
      "ARG BASE=alpine:3\nFROM $BASE AS a\nFROM scratch AS b\nFROM a AS c\nFROM x@sha256:abc AS d\n";
    expect(rules(text)).not.toContain("NX-DF001");
  });

  it("quick fixes produce the compliant text", () => {
    const text =
      "FROM alpine:3\nADD . /app\nRUN apt-get install -y curl\nUSER a\nHEALTHCHECK CMD true\n";
    let out = text;
    for (const i of lintDockerfile(text).filter((x) => x.fix)) {
      out = applyFix(text, i.fix as never);
      expect(lintDockerfile(out).map((x) => x.rule)).not.toContain(i.rule);
    }
    const fixed = applyFix(
      text,
      lintDockerfile(text).find((i) => i.rule === "NX-DF004")?.fix as never,
    );
    expect(fixed).toContain("COPY . /app");
  });
});
