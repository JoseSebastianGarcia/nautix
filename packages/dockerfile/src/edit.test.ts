import { describe, expect, it } from "vitest";
import {
  formToArgs,
  insertInstruction,
  lineCount,
  moveInstruction,
  parseDockerfile,
  parseForm,
  parseInstructions,
  removeInstruction,
  replaceInstruction,
} from "./index.js";

const SAMPLE = `# syntax=docker/dockerfile:1
# Build stage
FROM node:22-alpine AS build
WORKDIR /app

# deps first for the cache
COPY package*.json ./
RUN npm ci \\
    && npm cache clean --force
COPY . .

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

const find = (text: string, keyword: string, nth = 0) =>
  parseInstructions(text).filter((i) => i.keyword === keyword)[nth] as ReturnType<
    typeof parseInstructions
  >[number];

describe("instruction spans", () => {
  it("attaches the comment block right above an instruction, but not parser directives or separated comments", () => {
    const ins = parseInstructions(SAMPLE);
    expect(ins[0]).toMatchObject({ keyword: "FROM", startLine: 3, spanStart: 2 }); // "# Build stage" yes, "# syntax=" no
    expect(find(SAMPLE, "COPY")).toMatchObject({ startLine: 7, spanStart: 6 });
    expect(find(SAMPLE, "WORKDIR").spanStart).toBe(find(SAMPLE, "WORKDIR").startLine);
  });
});

describe("patching", () => {
  it("replaces only the instruction's own lines", () => {
    const run = find(SAMPLE, "RUN");
    const out = replaceInstruction(SAMPLE, run, "RUN", "npm ci --omit=dev");
    expect(out).toContain("RUN npm ci --omit=dev\nCOPY . .");
    expect(out).toContain("# deps first for the cache\nCOPY package*.json ./");
    expect(out.split("\n").length).toBe(SAMPLE.split("\n").length - 1);
    expect(
      out.replace("RUN npm ci --omit=dev\n", "RUN npm ci \\\n    && npm cache clean --force\n"),
    ).toBe(SAMPLE);
  });

  it("writes multi-line arguments with continuations", () => {
    const out = replaceInstruction(
      "FROM a\nRUN x\n",
      { startLine: 2, endLine: 2 },
      "run",
      "apt-get update\n&& apt-get install -y curl",
    );
    expect(out).toBe("FROM a\nRUN apt-get update \\\n    && apt-get install -y curl\n");
    expect(parseInstructions(out)[1]?.args.replace(/\s+/g, " ")).toBe(
      "apt-get update && apt-get install -y curl",
    );
  });

  it("removes an instruction with its comments and leaves the rest byte for byte", () => {
    const copy = find(SAMPLE, "COPY");
    const out = removeInstruction(SAMPLE, copy);
    expect(out).not.toContain("deps first");
    expect(out).not.toContain("COPY package*.json");
    expect(out).toContain("WORKDIR /app\n\nRUN npm ci");
  });

  it("inserts before a line, at the end, and in a file without trailing newline", () => {
    expect(insertInstruction("FROM a\nCMD b\n", 2, "RUN", "x")).toBe("FROM a\nRUN x\nCMD b\n");
    expect(insertInstruction("FROM a\n", 2, "RUN", "x")).toBe("FROM a\nRUN x\n");
    expect(insertInstruction("FROM a\n", 99, "RUN", "x")).toBe("FROM a\nRUN x\n");
    expect(insertInstruction("FROM a", 2, "RUN", "x")).toBe("FROM a\nRUN x");
    expect(lineCount("FROM a\nRUN x\n")).toBe(2);
    expect(lineCount("FROM a\nRUN x")).toBe(2);
  });

  it("keeps CRLF files CRLF", () => {
    const crlf = "FROM a\r\nRUN x\r\n";
    expect(replaceInstruction(crlf, { startLine: 2, endLine: 2 }, "RUN", "y")).toBe(
      "FROM a\r\nRUN y\r\n",
    );
    expect(insertInstruction(crlf, 3, "CMD", "z")).toBe("FROM a\r\nRUN x\r\nCMD z\r\n");
  });

  it("moves an instruction with its comments, down and up", () => {
    const text = "FROM a\n# one\nRUN 1\nRUN 2\nRUN 3\n";
    const first = find(text, "RUN", 0);
    expect(moveInstruction(text, first, 6)).toBe("FROM a\nRUN 2\nRUN 3\n# one\nRUN 1\n");
    const last = find(text, "RUN", 2);
    expect(moveInstruction(text, last, 2)).toBe("FROM a\nRUN 3\n# one\nRUN 1\nRUN 2\n");
    expect(moveInstruction(text, first, first.startLine)).toBe(text);
    expect(moveInstruction(text, first, first.endLine + 1)).toBe(text);
  });

  it("every operation keeps the file parseable and the stages intact", () => {
    const stages = (t: string) => parseDockerfile(t).stages.map((s) => [s.name, s.base]);
    let t = SAMPLE;
    t = insertInstruction(t, lineCount(t) + 1, "LABEL", "a=b");
    t = removeInstruction(t, find(t, "EXPOSE"));
    t = moveInstruction(t, find(t, "WORKDIR"), find(t, "COPY", 1).startLine + 1);
    expect(stages(t)).toEqual(stages(SAMPLE));
  });
});

describe("forms", () => {
  const round = (keyword: string, args: string) => formToArgs(parseForm(keyword, args));

  it.each([
    ["FROM", "node:22-alpine"],
    ["FROM", "node:22-alpine AS build"],
    ["FROM", "--platform=linux/amd64 node:22 AS base"],
    ["RUN", "npm ci && npm run build"],
    ["RUN", "--mount=type=cache,target=/root/.cache pip install -r requirements.txt"],
    ["COPY", "package.json ./"],
    ["COPY", "--from=build /app/dist /usr/share/nginx/html"],
    ["COPY", "--chown=app:app --chmod=755 a b /dest/"],
    ["COPY", "--link a.txt /b.txt"],
    ["COPY", '["a b", "/dest"]'],
    ["ADD", "https://x.test/f.tar.gz /tmp/"],
    ["ENV", "A=1 B=two"],
    ["ENV", 'GREETING="hello world"'],
    ["ARG", "VERSION"],
    ["ARG", "VERSION=1.2.3"],
    ["LABEL", 'a=b c="d e"'],
    ["EXPOSE", "80 443/tcp 53/udp"],
    ["WORKDIR", "/app"],
    ["USER", "app:app"],
    ["STOPSIGNAL", "SIGTERM"],
    ["VOLUME", "/data /logs"],
    ["VOLUME", '["/a b", "/c"]'],
    ["CMD", '["nginx", "-g", "daemon off;"]'],
    ["CMD", "node server.js"],
    ["ENTRYPOINT", '["app"]'],
    ["HEALTHCHECK", "NONE"],
    [
      "HEALTHCHECK",
      "--interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost/ || exit 1",
    ],
    ["HEALTHCHECK", 'CMD ["curl", "-f", "http://localhost/"]'],
    ["SHELL", '["/bin/bash", "-c"]'],
    ["ONBUILD", "RUN echo hi"],
  ])("%s %s survives parse → write unchanged", (keyword, args) => {
    expect(round(keyword as string, args as string)).toBe(args);
  });

  it("models the common fields", () => {
    expect(parseForm("FROM", "--platform=linux/arm64 node:22 AS build")).toEqual({
      type: "from",
      platform: "linux/arm64",
      image: "node:22",
      as: "build",
    });
    expect(parseForm("COPY", "--from=build --chown=1:1 a b /d/")).toMatchObject({
      type: "copy",
      from: "build",
      chown: "1:1",
      sources: ["a", "b"],
      dest: "/d/",
    });
    expect(parseForm("ENV", "A=1 B=2")).toEqual({
      type: "pairs",
      pairs: [
        { key: "A", value: "1" },
        { key: "B", value: "2" },
      ],
    });
    expect(parseForm("ARG", "X")).toEqual({ type: "pairs", pairs: [{ key: "X", value: null }] });
    expect(parseForm("EXPOSE", "80 443/tcp")).toEqual({ type: "expose", ports: ["80", "443/tcp"] });
    expect(parseForm("CMD", '["a","b"]')).toEqual({
      type: "command",
      command: { mode: "exec", exec: ["a", "b"] },
    });
    expect(parseForm("HEALTHCHECK", "--retries=2 CMD true")).toMatchObject({
      type: "healthcheck",
      retries: "2",
      command: { mode: "shell", shell: "true" },
    });
  });

  it("normalises the legacy ENV form and falls back to raw for what it cannot model", () => {
    expect(round("ENV", "KEY some value")).toBe("KEY=some value");
    expect(parseForm("COPY", "only-one-token")).toMatchObject({ type: "raw" });
    expect(parseForm("FROM", "a b c d")).toMatchObject({ type: "raw" });
    expect(parseForm("HEALTHCHECK", "--weird=1 CMD x")).toMatchObject({ type: "raw" });
    expect(round("HEALTHCHECK", "--weird=1 CMD x")).toBe("--weird=1 CMD x");
    expect(parseForm("MAINTAINER", "me@x.test")).toEqual({ type: "raw", text: "me@x.test" });
  });

  it("editing one field changes only that field", () => {
    const form = parseForm("COPY", "--from=build --link /app/dist /srv/");
    if (form.type !== "copy") throw new Error("expected copy");
    expect(formToArgs({ ...form, dest: "/usr/share/nginx/html" })).toBe(
      "--from=build --link /app/dist /usr/share/nginx/html",
    );
  });
});
