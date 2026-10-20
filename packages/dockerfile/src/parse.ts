export interface Instruction {
  /** Upper-cased keyword, e.g. `RUN`. */
  keyword: string;
  /** Everything after the keyword with continuation lines joined by a single space. */
  args: string;
  /** 1-based first and last line in the source. */
  startLine: number;
  endLine: number;
  /** First line of the comment block right above it (equals `startLine` when there is none). */
  spanStart: number;
}

export interface Stage {
  index: number;
  name: string | null;
  /** The image (or earlier stage) the stage starts from. */
  base: string;
  fromLine: number;
  instructions: Instruction[];
}

export interface Dockerfile {
  /** Instructions before the first FROM (normally ARG only). */
  preamble: Instruction[];
  stages: Stage[];
  instructions: Instruction[];
}

/** `# syntax=…`, `# escape=…`: belong to the file, not to the instruction below them. */
const DIRECTIVE = /^\s*#\s*(syntax|escape|check)\s*=/i;

const HEREDOC = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/;

/** Splits a Dockerfile into instructions: comments skipped, `\` continuations and heredocs joined. */
export const parseInstructions = (text: string): Instruction[] => {
  const lines = text.split(/\r?\n/);
  const escapeChar =
    /^\s*#\s*escape\s*=\s*(\\|`)\s*$/im.exec(lines.slice(0, 5).join("\n"))?.[1] ?? "\\";
  const out: Instruction[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const startLine = i + 1;
    let joined = "";
    let cursor = i;
    for (;;) {
      const current = lines[cursor] as string;
      if (current.trim().startsWith("#") && cursor !== i) {
        cursor++;
        if (cursor >= lines.length) break;
        continue;
      }
      const trimmedEnd = current.replace(/\s+$/, "");
      if (trimmedEnd.endsWith(escapeChar) && cursor + 1 < lines.length) {
        joined += `${trimmedEnd.slice(0, -1)} `;
        cursor++;
        continue;
      }
      joined += trimmedEnd;
      break;
    }
    let endLine = cursor + 1;
    const heredoc = HEREDOC.exec(joined);
    if (heredoc?.[2] && /^\s*(RUN|COPY|ADD)\b/i.test(joined)) {
      let k = cursor + 1;
      while (k < lines.length && (lines[k] as string).trim() !== heredoc[2]) k++;
      endLine = Math.min(k, lines.length - 1) + 1;
      cursor = Math.min(k, lines.length - 1);
    }
    const match = /^\s*([A-Za-z]+)\s*(.*)$/s.exec(joined);
    let spanStart = startLine;
    while (
      spanStart > 1 &&
      (lines[spanStart - 2] as string).trim().startsWith("#") &&
      !DIRECTIVE.test(lines[spanStart - 2] as string)
    )
      spanStart--;
    if (match?.[1]) {
      out.push({
        keyword: match[1].toUpperCase(),
        args: (match[2] ?? "").trim(),
        startLine,
        endLine,
        spanStart,
      });
    }
    i = cursor + 1;
  }
  return out;
};

const FROM_ARGS = /^(?:--\S+\s+)*(\S+)(?:\s+[Aa][Ss]\s+(\S+))?/;

export const parseDockerfile = (text: string): Dockerfile => {
  const instructions = parseInstructions(text);
  const preamble: Instruction[] = [];
  const stages: Stage[] = [];
  for (const ins of instructions) {
    if (ins.keyword === "FROM") {
      const m = FROM_ARGS.exec(ins.args);
      stages.push({
        index: stages.length,
        name: m?.[2] ? m[2].toLowerCase() : null,
        base: m?.[1] ?? "",
        fromLine: ins.startLine,
        instructions: [ins],
      });
    } else if (stages.length === 0) {
      preamble.push(ins);
    } else {
      stages[stages.length - 1]?.instructions.push(ins);
    }
  }
  return { preamble, stages, instructions };
};

export interface StageGraph {
  nodes: { id: string; label: string; base: string; final: boolean }[];
  edges: { from: string; to: string; kind: "base" | "copy" }[];
}

/** Stages as nodes; an edge when a stage starts FROM another stage or copies `--from` it. */
export const stageGraph = (df: Dockerfile): StageGraph => {
  const idOf = (ref: string): string | undefined => {
    const lower = ref.toLowerCase();
    const byName = df.stages.find((s) => s.name === lower);
    if (byName) return `s${byName.index}`;
    return /^\d+$/.test(ref) && df.stages[Number(ref)] ? `s${ref}` : undefined;
  };
  const nodes = df.stages.map((s) => ({
    id: `s${s.index}`,
    label: s.name ?? `stage ${s.index}`,
    base: s.base,
    final: s.index === df.stages.length - 1,
  }));
  const edges: StageGraph["edges"] = [];
  for (const s of df.stages) {
    const from = idOf(s.base);
    if (from && from !== `s${s.index}`) edges.push({ from, to: `s${s.index}`, kind: "base" });
    for (const ins of s.instructions) {
      if (ins.keyword !== "COPY") continue;
      const ref = /--from=(\S+)/i.exec(ins.args)?.[1];
      const source = ref ? idOf(ref) : undefined;
      if (source) edges.push({ from: source, to: `s${s.index}`, kind: "copy" });
    }
  }
  return { nodes, edges };
};
