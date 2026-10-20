/**
 * Structured views of instruction arguments for the form editor. Parsing never unquotes: what the user sees
 * is what is in the file, so editing one field cannot change how another one is written.
 */

export type Command = { mode: "exec"; exec: string[] } | { mode: "shell"; shell: string };

export interface Pair {
  key: string;
  /** null = no `=value` (an `ARG NAME`). */
  value: string | null;
}

export type Form =
  | { type: "from"; platform: string; image: string; as: string }
  | { type: "run"; flags: string[]; command: string }
  | {
      type: "copy";
      from: string;
      chown: string;
      chmod: string;
      /** Flags the form has no field for (`--link`, `--chown`…); kept verbatim. */
      flags: string[];
      /** A `["src", "dest"]` array is left untouched. */
      raw: string | null;
      sources: string[];
      dest: string;
    }
  | { type: "pairs"; pairs: Pair[] }
  | { type: "expose"; ports: string[] }
  | { type: "single"; value: string }
  | { type: "list"; items: string[] }
  | { type: "command"; command: Command }
  | {
      type: "healthcheck";
      none: boolean;
      interval: string;
      timeout: string;
      startPeriod: string;
      retries: string;
      command: Command;
    }
  | { type: "raw"; text: string };

/** Splits on whitespace outside quotes; quotes stay in the tokens. */
export const tokens = (text: string): string[] => {
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (/\s/.test(ch)) {
      if (current) out.push(current);
      current = "";
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
};

const leadingFlags = (args: string): { flags: string[]; rest: string } => {
  const flags: string[] = [];
  let rest = args.trimStart();
  for (;;) {
    const m = /^(--[A-Za-z-]+(?:=("[^"]*"|'[^']*'|\S*))?)\s*/.exec(rest);
    if (!m) break;
    flags.push(m[1] as string);
    rest = rest.slice(m[0].length);
  }
  return { flags, rest };
};

const flagValue = (flags: string[], name: string): { value: string; others: string[] } => {
  const prefix = `--${name}=`;
  const found = flags.find((f) => f.startsWith(prefix));
  return {
    value: found ? found.slice(prefix.length) : "",
    others: flags.filter((f) => f !== found),
  };
};

export const isExecForm = (args: string): boolean => args.trim().startsWith("[");

const parseCommand = (args: string): Command => {
  const t = args.trim();
  if (isExecForm(t)) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string"))
        return { mode: "exec", exec: parsed as string[] };
    } catch {
      /* not valid JSON: treated as a shell string */
    }
  }
  return { mode: "shell", shell: t };
};

const commandToArgs = (c: Command): string =>
  c.mode === "exec" ? `[${c.exec.map((a) => JSON.stringify(a)).join(", ")}]` : c.shell;

const SINGLE = new Set(["WORKDIR", "USER", "STOPSIGNAL"]);

export const parseForm = (keyword: string, args: string): Form => {
  const kw = keyword.toUpperCase();
  const text = args.trim();
  if (kw === "FROM") {
    const { flags, rest } = leadingFlags(text);
    const platform = flagValue(flags, "platform");
    const m = /^(\S+)(?:\s+[Aa][Ss]\s+(\S+))?\s*$/.exec(rest);
    if (!m || platform.others.length > 0) return { type: "raw", text };
    return { type: "from", platform: platform.value, image: m[1] as string, as: m[2] ?? "" };
  }
  if (kw === "RUN") {
    const { flags, rest } = leadingFlags(text);
    return { type: "run", flags, command: rest };
  }
  if (kw === "COPY" || kw === "ADD") {
    const { flags, rest } = leadingFlags(text);
    if (isExecForm(rest))
      return {
        type: "copy",
        from: "",
        chown: "",
        chmod: "",
        flags,
        raw: rest,
        sources: [],
        dest: "",
      };
    const from = flagValue(flags, "from");
    const chown = flagValue(from.others, "chown");
    const chmod = flagValue(chown.others, "chmod");
    const parts = tokens(rest);
    if (parts.length < 2) return { type: "raw", text };
    return {
      type: "copy",
      from: from.value,
      chown: chown.value,
      chmod: chmod.value,
      flags: chmod.others,
      raw: null,
      sources: parts.slice(0, -1),
      dest: parts.at(-1) as string,
    };
  }
  if (kw === "ENV" || kw === "ARG" || kw === "LABEL") {
    const parts = tokens(text);
    if (parts.length === 0) return { type: "pairs", pairs: [] };
    // Legacy `ENV KEY some value` (no `=`): keep it editable as one pair.
    if (kw === "ENV" && !(parts[0] as string).includes("=")) {
      return {
        type: "pairs",
        pairs: [{ key: parts[0] as string, value: text.slice((parts[0] as string).length).trim() }],
      };
    }
    return {
      type: "pairs",
      pairs: parts.map((p) => {
        const eq = p.indexOf("=");
        return eq < 0 ? { key: p, value: null } : { key: p.slice(0, eq), value: p.slice(eq + 1) };
      }),
    };
  }
  if (kw === "EXPOSE") return { type: "expose", ports: tokens(text) };
  if (SINGLE.has(kw)) return { type: "single", value: text };
  if (kw === "VOLUME") {
    if (isExecForm(text)) {
      const c = parseCommand(text);
      return c.mode === "exec" ? { type: "list", items: c.exec } : { type: "raw", text };
    }
    return { type: "list", items: tokens(text) };
  }
  if (kw === "CMD" || kw === "ENTRYPOINT") return { type: "command", command: parseCommand(text) };
  if (kw === "HEALTHCHECK") {
    if (/^none$/i.test(text))
      return {
        type: "healthcheck",
        none: true,
        interval: "",
        timeout: "",
        startPeriod: "",
        retries: "",
        command: { mode: "shell", shell: "" },
      };
    const { flags, rest } = leadingFlags(text);
    const m = /^CMD\s+([\s\S]*)$/i.exec(rest);
    if (!m) return { type: "raw", text };
    const interval = flagValue(flags, "interval");
    const timeout = flagValue(interval.others, "timeout");
    const start = flagValue(timeout.others, "start-period");
    const retries = flagValue(start.others, "retries");
    if (retries.others.length > 0) return { type: "raw", text };
    return {
      type: "healthcheck",
      none: false,
      interval: interval.value,
      timeout: timeout.value,
      startPeriod: start.value,
      retries: retries.value,
      command: parseCommand(m[1] as string),
    };
  }
  return { type: "raw", text };
};

export const formToArgs = (form: Form): string => {
  switch (form.type) {
    case "from": {
      const platform = form.platform ? `--platform=${form.platform} ` : "";
      return `${platform}${form.image}${form.as ? ` AS ${form.as}` : ""}`;
    }
    case "run":
      return [...form.flags, form.command].filter((p) => p !== "").join(" ");
    case "copy": {
      const flags = [
        ...(form.from ? [`--from=${form.from}`] : []),
        ...(form.chown ? [`--chown=${form.chown}`] : []),
        ...(form.chmod ? [`--chmod=${form.chmod}`] : []),
        ...form.flags,
      ];
      const body = form.raw ?? [...form.sources, form.dest].filter((p) => p !== "").join(" ");
      return [...flags, body].filter((p) => p !== "").join(" ");
    }
    case "pairs":
      return form.pairs
        .filter((p) => p.key !== "")
        .map((p) => (p.value === null ? p.key : `${p.key}=${p.value}`))
        .join(" ");
    case "expose":
      return form.ports.join(" ");
    case "single":
      return form.value;
    case "list":
      return form.items.length > 0 && form.items.some((i) => /\s/.test(i))
        ? `[${form.items.map((a) => JSON.stringify(a)).join(", ")}]`
        : form.items.join(" ");
    case "command":
      return commandToArgs(form.command);
    case "healthcheck": {
      if (form.none) return "NONE";
      const flags = [
        ...(form.interval ? [`--interval=${form.interval}`] : []),
        ...(form.timeout ? [`--timeout=${form.timeout}`] : []),
        ...(form.startPeriod ? [`--start-period=${form.startPeriod}`] : []),
        ...(form.retries ? [`--retries=${form.retries}`] : []),
      ];
      return [...flags, "CMD", commandToArgs(form.command)].join(" ");
    }
    case "raw":
      return form.text;
  }
};

/** Instructions the "Add" menu offers, with a ready-to-edit starting value. */
export const NEW_INSTRUCTIONS: readonly { keyword: string; args: string }[] = [
  { keyword: "RUN", args: "echo hello" },
  { keyword: "COPY", args: ". ." },
  { keyword: "ADD", args: "https://example.com/file.tar.gz /tmp/" },
  { keyword: "ENV", args: "KEY=value" },
  { keyword: "ARG", args: "NAME=value" },
  { keyword: "WORKDIR", args: "/app" },
  { keyword: "EXPOSE", args: "8080" },
  { keyword: "USER", args: "app" },
  { keyword: "CMD", args: '["executable", "arg"]' },
  { keyword: "ENTRYPOINT", args: '["executable"]' },
  {
    keyword: "HEALTHCHECK",
    args: "--interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost/ || exit 1",
  },
  { keyword: "VOLUME", args: "/data" },
  { keyword: "LABEL", args: "org.opencontainers.image.title=app" },
  { keyword: "STOPSIGNAL", args: "SIGTERM" },
  { keyword: "SHELL", args: '["/bin/bash", "-c"]' },
  { keyword: "ONBUILD", args: "RUN echo build" },
];
