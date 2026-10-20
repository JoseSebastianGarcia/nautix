import { type Dockerfile, type Instruction, parseDockerfile } from "./parse.js";

export type Severity = "error" | "warning" | "info";

export interface Fix {
  /** Replaces lines [startLine, endLine] (1-based, inclusive) with `text`. */
  startLine: number;
  endLine: number;
  text: string;
}

export interface LintIssue {
  rule: string;
  severity: Severity;
  line: number;
  /** Values for the translated message. */
  params: Record<string, string>;
  fix?: Fix;
}

const KNOWN = new Set([
  "FROM",
  "RUN",
  "CMD",
  "LABEL",
  "MAINTAINER",
  "EXPOSE",
  "ENV",
  "ADD",
  "COPY",
  "ENTRYPOINT",
  "VOLUME",
  "USER",
  "WORKDIR",
  "ARG",
  "ONBUILD",
  "STOPSIGNAL",
  "HEALTHCHECK",
  "SHELL",
]);
const SECRET_NAME = /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)/i;

const issue = (
  rule: string,
  severity: Severity,
  line: number,
  params: Record<string, string> = {},
  fix?: Fix,
): LintIssue => ({ rule, severity, line, params, ...(fix ? { fix } : {}) });

const isJsonArray = (args: string): boolean => args.trim().startsWith("[");

const imageTag = (base: string): { name: string; tag: string | null; pinned: boolean } => {
  if (base.includes("@sha256:")) return { name: base, tag: null, pinned: true };
  const slash = base.lastIndexOf("/");
  const colon = base.lastIndexOf(":");
  return colon > slash
    ? { name: base.slice(0, colon), tag: base.slice(colon + 1), pinned: false }
    : { name: base, tag: null, pinned: false };
};

const RESTORE =
  /\b(?:dotnet\s+restore|npm\s+(?:ci|install)|yarn\s+install|pnpm\s+install|pip3?\s+install|go\s+mod\s+download|bundle\s+install|composer\s+install)\b/;

const inFinal = (df: Dockerfile): Instruction[] => df.stages.at(-1)?.instructions ?? [];

export const lintDockerfile = (text: string): LintIssue[] => {
  const df = parseDockerfile(text);
  const issues: LintIssue[] = [];
  const stageNames = new Set(df.stages.map((s) => s.name).filter((n): n is string => n !== null));

  // NX-DF011 / NX-DF012: structure
  if (df.stages.length === 0) {
    issues.push(issue("NX-DF011", "error", df.instructions[0]?.startLine ?? 1));
    return issues;
  }
  for (const ins of df.preamble)
    if (ins.keyword !== "ARG") issues.push(issue("NX-DF011", "error", ins.startLine));
  for (const ins of df.instructions)
    if (!KNOWN.has(ins.keyword))
      issues.push(issue("NX-DF012", "error", ins.startLine, { keyword: ins.keyword }));

  // NX-DF001: unpinned base images
  for (const s of df.stages) {
    const base = s.base;
    if (
      !base ||
      base.toLowerCase() === "scratch" ||
      base.includes("$") ||
      stageNames.has(base.toLowerCase())
    )
      continue;
    const { tag, pinned } = imageTag(base);
    if (!pinned && (tag === null || tag === "latest"))
      issues.push(issue("NX-DF001", "warning", s.fromLine, { image: base }));
  }

  const final = inFinal(df);
  const finalFrom = final[0];
  const finalBase = df.stages.at(-1)?.base.toLowerCase();

  // NX-DF002: runs as root
  const users = final.filter((i) => i.keyword === "USER");
  const lastUser = users.at(-1)?.args.trim().split(/[:\s]/)[0];
  if (finalBase !== "scratch" && (!lastUser || lastUser === "root" || lastUser === "0"))
    issues.push(issue("NX-DF002", "warning", users.at(-1)?.startLine ?? finalFrom?.startLine ?? 1));

  // NX-DF003: no HEALTHCHECK
  if (finalBase !== "scratch" && !final.some((i) => i.keyword === "HEALTHCHECK"))
    issues.push(issue("NX-DF003", "info", finalFrom?.startLine ?? 1));

  for (const s of df.stages) {
    const seen = new Map<string, number>();
    for (const ins of s.instructions) {
      const a = ins.args;
      // NX-DF004: ADD where COPY is enough
      if (ins.keyword === "ADD") {
        const sources = a
          .replace(/--\S+\s+/g, "")
          .split(/\s+/)
          .slice(0, -1);
        const needsAdd = sources.some(
          (x) => /^https?:\/\//.test(x) || /\.(tar|tgz|tar\.gz|tar\.bz2|tar\.xz)$/.test(x),
        );
        if (!needsAdd && ins.startLine === ins.endLine)
          issues.push(
            issue(
              "NX-DF004",
              "warning",
              ins.startLine,
              {},
              { startLine: ins.startLine, endLine: ins.endLine, text: `COPY ${a}` },
            ),
          );
      }
      // NX-DF005: secrets baked into the image
      if (ins.keyword === "ENV" || ins.keyword === "ARG") {
        for (const m of a.matchAll(
          /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=("[^"]+"|'[^']+'|[^\s"']+)/g,
        )) {
          const name = m[1] as string;
          if (SECRET_NAME.test(name))
            issues.push(issue("NX-DF005", "error", ins.startLine, { name }));
        }
        const legacy = /^([A-Za-z_][A-Za-z0-9_]*)\s+\S+/.exec(a);
        if (
          ins.keyword === "ENV" &&
          legacy &&
          !a.includes("=") &&
          SECRET_NAME.test(legacy[1] as string)
        )
          issues.push(issue("NX-DF005", "error", ins.startLine, { name: legacy[1] as string }));
      }
      if (ins.keyword === "RUN") {
        // NX-DF006: pipe-to-shell installs
        if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(a))
          issues.push(issue("NX-DF006", "warning", ins.startLine));
        if (/apt-get\s+(-\S+\s+)*update/.test(a) && !/apt-get\s+(-\S+\s+)*install/.test(a))
          issues.push(issue("NX-DF007", "warning", ins.startLine));
        const install = /apt-get\s+(?:-\S+\s+)*install\b[^&|;]*/.exec(a);
        if (install && !/--no-install-recommends/.test(install[0]) && ins.startLine === ins.endLine)
          issues.push(
            issue(
              "NX-DF008",
              "info",
              ins.startLine,
              {},
              {
                startLine: ins.startLine,
                endLine: ins.endLine,
                text: `RUN ${a.replace(/(apt-get\s+(?:-\S+\s+)*install)\b/, "$1 --no-install-recommends")}`,
              },
            ),
          );
      }
      // NX-DF009: relative WORKDIR
      if (ins.keyword === "WORKDIR" && !/^(\/|[A-Za-z]:|\$|")/.test(a))
        issues.push(issue("NX-DF009", "warning", ins.startLine, { path: a }));
      // NX-DF010: repeated CMD / ENTRYPOINT
      if (ins.keyword === "CMD" || ins.keyword === "ENTRYPOINT") {
        if (seen.has(ins.keyword))
          issues.push(issue("NX-DF010", "warning", ins.startLine, { keyword: ins.keyword }));
        seen.set(ins.keyword, ins.startLine);
        // NX-DF013: shell form hides the process from signals
        if (!isJsonArray(a))
          issues.push(issue("NX-DF013", "info", ins.startLine, { keyword: ins.keyword }));
      }
    }
    // NX-DF014: copying the whole tree before restoring dependencies busts the cache on every edit
    // NX-DF015: build steps after CMD / ENTRYPOINT: they work, but the file no longer reads in order
    const copyAll = s.instructions.find(
      (i) =>
        i.keyword === "COPY" &&
        !/--from=/.test(i.args) &&
        /^(?:--\S+\s+)*\.\/?\s+\S+$/.test(i.args.trim()),
    );
    const restore = s.instructions.find((i) => i.keyword === "RUN" && RESTORE.test(i.args));
    if (copyAll && restore && copyAll.startLine < restore.startLine)
      issues.push(issue("NX-DF014", "warning", copyAll.startLine));
    const runtimeAt = s.instructions.findIndex(
      (i) => i.keyword === "CMD" || i.keyword === "ENTRYPOINT",
    );
    const late =
      runtimeAt < 0
        ? undefined
        : s.instructions
            .slice(runtimeAt + 1)
            .find((i) => i.keyword === "RUN" || i.keyword === "COPY");
    if (late) issues.push(issue("NX-DF015", "info", late.startLine, { keyword: late.keyword }));
  }
  return issues.sort((x, y) => x.line - y.line || x.rule.localeCompare(y.rule));
};

/** Applies a quick fix to the source text. */
export const applyFix = (text: string, fix: Fix): string => {
  const lines = text.split("\n");
  lines.splice(fix.startLine - 1, fix.endLine - fix.startLine + 1, ...fix.text.split("\n"));
  return lines.join("\n");
};

export const RULES = [
  "NX-DF001",
  "NX-DF002",
  "NX-DF003",
  "NX-DF004",
  "NX-DF005",
  "NX-DF006",
  "NX-DF007",
  "NX-DF008",
  "NX-DF009",
  "NX-DF010",
  "NX-DF011",
  "NX-DF012",
  "NX-DF013",
  "NX-DF014",
  "NX-DF015",
] as const;
