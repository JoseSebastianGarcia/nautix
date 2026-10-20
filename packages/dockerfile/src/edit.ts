import type { Instruction } from "./parse.js";

/** Lines of a Dockerfile exactly as written (a CRLF file keeps its `\r` at each line end). */
const split = (text: string): string[] => text.split("\n");
const eolOf = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

/** `KEYWORD args`; multi-line args (a RUN typed over several lines) get `\` continuations. */
export const formatInstruction = (keyword: string, args: string): string[] => {
  const parts = args.replace(/\r/g, "").split("\n");
  const first = `${keyword.toUpperCase()} ${parts[0] ?? ""}`.trimEnd();
  if (parts.length === 1) return [first];
  const all = [first, ...parts.slice(1).map((p) => `    ${p.trim()}`)];
  return all.map((line, i) => (i < all.length - 1 ? `${line} \\` : line));
};

const withEol = (lines: string[], eol: string): string[] =>
  eol === "\r\n" ? lines.map((l) => `${l}\r`) : lines;

/** Rewrites one instruction in place; the comments above it, blank lines and every other line stay as they were. */
export const replaceInstruction = (
  text: string,
  ins: Pick<Instruction, "startLine" | "endLine">,
  keyword: string,
  args: string,
): string => {
  const lines = split(text);
  lines.splice(
    ins.startLine - 1,
    ins.endLine - ins.startLine + 1,
    ...withEol(formatInstruction(keyword, args), eolOf(text)),
  );
  return lines.join("\n");
};

/** Removes an instruction together with the comment block above it. */
export const removeInstruction = (
  text: string,
  ins: Pick<Instruction, "spanStart" | "endLine">,
): string => {
  const lines = split(text);
  lines.splice(ins.spanStart - 1, ins.endLine - ins.spanStart + 1);
  return lines.join("\n");
};

/** Inserts a new instruction before 1-based line `atLine` (use `lineCount + 1` for the end). */
export const insertInstruction = (
  text: string,
  atLine: number,
  keyword: string,
  args: string,
): string => {
  const lines = split(text);
  const added = withEol(formatInstruction(keyword, args), eolOf(text));
  const endsWithNewline = lines.at(-1) === "";
  const last = endsWithNewline ? lines.length - 1 : lines.length; // content lines
  const at = Math.min(Math.max(atLine, 1), last + 1);
  lines.splice(at - 1, 0, ...added);
  return lines.join("\n");
};

/** Moves an instruction (with its comments) so it sits before 1-based line `beforeLine`. */
export const moveInstruction = (
  text: string,
  ins: Pick<Instruction, "spanStart" | "endLine">,
  beforeLine: number,
): string => {
  if (beforeLine >= ins.spanStart && beforeLine <= ins.endLine + 1) return text; // already there
  const lines = split(text);
  const span = lines.splice(ins.spanStart - 1, ins.endLine - ins.spanStart + 1);
  const size = span.length;
  const target = beforeLine > ins.endLine ? beforeLine - size : beforeLine;
  lines.splice(target - 1, 0, ...span);
  return lines.join("\n");
};

/** Number of the line after the last one of an instruction (where a following block would start). */
export const lineAfter = (ins: Pick<Instruction, "endLine">): number => ins.endLine + 1;

/** Number of lines in the text for `insertInstruction(…, lineCount + 1, …)`. */
export const lineCount = (text: string): number => {
  const lines = split(text);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
};
